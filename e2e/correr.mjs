#!/usr/bin/env node
// Corre escenarios E2E y deja la evidencia en e2e/evidencia/<corrida>/.
//
//   node e2e/correr.mjs <grupo|grupo/nombre|todo>... [--corrida nombre] [--con-cuota]
//
// Cada escenario vive en e2e/escenarios/<grupo>/<nombre>.mjs y exporta:
//   export const meta = { descripcion, puerto: 3901|3902, cuota: bool, instanciaLimpia: bool }
//   export async function correr(ctx) { ... ctx.check(...) ... }
// `cuota: true` = gasta turnos reales o crea sesiones de Claude: sin
// --con-cuota, o con el gobernador en rojo, sus checks quedan "bloqueado".
// `instanciaLimpia: true` = el escenario arranca con su instancia recién
// reiniciada y sin cuota.json (no hereda estado del escenario anterior).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVIDENCIA, PREFIJO, PROYECTO, REPO, puertoDeEscenario, taparTokens, tokenDe } from './lib/config.mjs';
import { abrir } from './lib/navegador.mjs';
import { gobernador, teardown } from './sesiones.mjs';
import { reiniciarLimpia } from './instancia.mjs';

const DIR_ESC = path.join(REPO, 'e2e', 'escenarios');

function listarEscenarios() {
  const todos = [];
  for (const grupo of fs.readdirSync(DIR_ESC).sort()) {
    const dir = path.join(DIR_ESC, grupo);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.mjs')) todos.push(`${grupo}/${f.replace(/\.mjs$/, '')}`);
    }
  }
  return todos;
}

function seleccionar(filtros) {
  const todos = listarEscenarios();
  if (filtros.includes('todo')) return todos;
  return todos.filter((e) => filtros.some((f) => e === f || e.startsWith(`${f}/`)));
}

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const corrida = opt('--corrida') ?? `corrida-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
const conCuota = args.includes('--con-cuota');
const filtros = args.filter((a) => !a.startsWith('--'));
const elegidos = seleccionar(filtros);
if (!elegidos.length) {
  console.error(`ningún escenario coincide con ${filtros.join(' ')}. Hay: ${listarEscenarios().join(', ')}`);
  process.exit(64);
}

const dirCorrida = path.join(EVIDENCIA, corrida);
fs.mkdirSync(dirCorrida, { recursive: true });
const filas = [];
const gob = gobernador();
const contraReal = Boolean(process.env.CLOUDCLI_URL);

// Contra :3001 el proyecto descartable se da de alta al empezar y se archiva al
// terminar (Fase 12, paso 4). En las instancias de prueba lo hace instancia.mjs.
async function apiReal(ruta, init = {}) {
  const r = await fetch(`${process.env.CLOUDCLI_URL}/api${ruta}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await tokenDe()}`, ...init.headers },
  });
  return r;
}
if (contraReal) {
  fs.mkdirSync(PROYECTO, { recursive: true });
  const r = await apiReal('/projects/create-project', { method: 'POST', body: JSON.stringify({ path: PROYECTO, customName: 'e2e-proyecto' }) });
  if (!r.ok && r.status !== 409) throw new Error(`create-project en :3001: HTTP ${r.status}`);
}

for (const id of elegidos) {
  const mod = await import(path.join(DIR_ESC, `${id}.mjs`));
  const meta = mod.meta ?? {};
  const dir = path.join(dirCorrida, id.replace('/', '-'));
  fs.mkdirSync(dir, { recursive: true });
  const checks = [];
  const t0 = Date.now();
  // Los de :3902 hablan con el CLI falso (guiones, deltas a medida); :3001
  // corre el Claude real. Solo los que lo declaran (`contraReal`) van igual.
  const bloqueo = contraReal && meta.puerto === 3902 && !meta.contraReal ? 'usa el CLI falso de :3902; :3001 corre el Claude real'
    : meta.cuota && !conCuota ? 'sin --con-cuota'
    : meta.cuota && gob.color === 'rojo' ? `gobernador en rojo (${gob.motivo})` : null;
  const sesionesAbiertas = [];
  const ctx = {
    id, meta, dir,
    async abrir(opciones = {}) {
      const s = await abrir({ puerto: puertoDeEscenario(meta.puerto), ...opciones });
      sesionesAbiertas.push(s);
      return s;
    },
    async captura(s, nombre) {
      const destino = path.join(dir, `${nombre}.png`);
      await s.pagina.screenshot({ path: destino });
      return path.relative(dirCorrida, destino);
    },
    guardar(nombre, datos) {
      const destino = path.join(dir, nombre);
      fs.writeFileSync(destino, taparTokens(typeof datos === 'string' ? datos : JSON.stringify(datos, null, 2)));
      return path.relative(dirCorrida, destino);
    },
    // Un escenario que no puede correr por algo ajeno (credenciales, cuota) lo dice, no falla.
    bloquear(motivo) {
      for (const c of meta.checks ?? ['(todo el escenario)']) checks.push({ escenario: id, nombre: c, resultado: 'bloqueado', evidencia: [], datos: motivo });
      console.log(`  ⏸ bloqueado: ${motivo}`);
    },
    check(nombre, pasa, { evidencia = [], datos: crudos } = {}) {
      const datos = crudos === undefined ? undefined : JSON.parse(taparTokens(JSON.stringify(crudos)));
      const r = { escenario: id, nombre, resultado: pasa ? 'pasa' : 'falla', evidencia: [].concat(evidencia).filter(Boolean), datos };
      checks.push(r);
      console.log(`  ${pasa ? '✓' : '✗'} ${nombre}${datos !== undefined ? ` — ${JSON.stringify(datos).slice(0, 160)}` : ''}`);
      return pasa;
    },
  };
  console.log(`▶ ${id}${meta.descripcion ? ` — ${meta.descripcion}` : ''}`);
  if (bloqueo) {
    for (const c of meta.checks ?? ['(todo el escenario)']) {
      checks.push({ escenario: id, nombre: c, resultado: 'bloqueado', evidencia: [], datos: bloqueo });
    }
    console.log(`  ⏸ bloqueado: ${bloqueo}`);
  } else {
    try {
      if (meta.instanciaLimpia && !process.env.CLOUDCLI_URL) {
        await reiniciarLimpia(puertoDeEscenario(meta.puerto) === puertoDeEscenario(3902) ? ['--falso'] : []);
      }
      await mod.correr(ctx);
    } catch (e) {
      const cap = [];
      for (const s of sesionesAbiertas) {
        try { cap.push(await ctx.captura(s, `error-${sesionesAbiertas.indexOf(s)}`)); } catch { /* cerrada */ }
      }
      ctx.check(`el escenario corre sin excepción: ${String(e.message).split('\n')[0]}`, false, { evidencia: cap, datos: String(e.stack).split('\n').slice(0, 4).join(' | ') });
    } finally {
      for (const s of sesionesAbiertas) {
        try { ctx.guardar(`frames-${sesionesAbiertas.indexOf(s)}.json`, s.frames.filter((f) => f.datos?.kind !== 'loading_progress')); } catch { /* sin frames */ }
        try { const todo = [...(s.erroresDeCarga ?? []).map((e) => `[carga] ${e}`), ...s.errores]; if (todo.length) ctx.guardar(`consola-${sesionesAbiertas.indexOf(s)}.txt`, todo.join('\n')); } catch { /* nada */ }
        await s.navegador.close().catch(() => {});
      }
      // Un check sin captura propia lleva el log de frames del escenario: ninguna fila queda sin evidencia.
      const log = path.join(dir, 'frames-0.json');
      if (fs.existsSync(log)) {
        for (const c of checks) if (!c.evidencia.length) c.evidencia.push(path.relative(dirCorrida, log));
      }
      if (meta.cuota || meta.tmux) {
        const t = teardown();
        if (!t.ajenasIntactas) console.error('  ⚠ el teardown cambió sesiones ajenas: revisar ya');
      }
    }
  }
  filas.push(...checks.map((c) => ({ ...c, ms: Date.now() - t0 })));
}

const icono = { pasa: '✅ pasa', falla: '❌ falla', bloqueado: '⏸ bloqueado' };
const md = [
  `# Evidencia E2E — ${corrida}`,
  '',
  `Fecha: ${new Date().toISOString()} · Escenarios: ${elegidos.length} · Gobernador: ${gob.color}${gob.motivo ? ` (${gob.motivo})` : ''}`,
  '',
  `| Resultado | Cantidad |`, '|---|---|',
  ...['pasa', 'falla', 'bloqueado'].map((r) => `| ${icono[r]} | ${filas.filter((f) => f.resultado === r).length} |`),
  '',
  '| Escenario | Check | Resultado | Evidencia | Datos |',
  '|---|---|---|---|---|',
  ...filas.map((f) => `| \`${f.escenario}\` | ${f.nombre.replace(/\|/g, '\\|')} | ${icono[f.resultado]} | ${f.evidencia.map((e) => `[${path.basename(e)}](${e})`).join(' ') || '—'} | ${f.datos === undefined ? '' : String(typeof f.datos === 'string' ? f.datos : JSON.stringify(f.datos)).replace(/\|/g, '\\|').slice(0, 220)} |`),
  '',
];
const informe = path.join(dirCorrida, 'informe.md');
// Varias invocaciones con la misma --corrida se acumulan en el mismo informe.
const previo = fs.existsSync(path.join(dirCorrida, 'filas.json')) ? JSON.parse(fs.readFileSync(path.join(dirCorrida, 'filas.json'), 'utf8')) : [];
const conLog = (f) => {
  const log = path.join(dirCorrida, f.escenario.replace('/', '-'), 'frames-0.json');
  return f.evidencia.length || f.resultado === 'bloqueado' || !fs.existsSync(log) ? f : { ...f, evidencia: [path.relative(dirCorrida, log)] };
};
const todas = [...previo.filter((p) => !elegidos.includes(p.escenario)), ...filas].map(conLog);
fs.writeFileSync(path.join(dirCorrida, 'filas.json'), JSON.stringify(todas, null, 2));
if (todas.length !== filas.length) {
  md.splice(0, md.length,
    `# Evidencia E2E — ${corrida}`, '',
    `Actualizado: ${new Date().toISOString()} · Gobernador: ${gob.color}`, '',
    '| Resultado | Cantidad |', '|---|---|',
    ...['pasa', 'falla', 'bloqueado'].map((r) => `| ${icono[r]} | ${todas.filter((f) => f.resultado === r).length} |`), '',
    '| Escenario | Check | Resultado | Evidencia | Datos |', '|---|---|---|---|---|',
    ...todas.map((f) => `| \`${f.escenario}\` | ${f.nombre.replace(/\|/g, '\\|')} | ${icono[f.resultado]} | ${f.evidencia.map((e) => `[${path.basename(e)}](${e})`).join(' ') || '—'} | ${f.datos === undefined ? '' : String(typeof f.datos === 'string' ? f.datos : JSON.stringify(f.datos)).replace(/\|/g, '\\|').slice(0, 220)} |`), '');
}
// La lectura humana de la corrida (por punto, causas, números) vive aparte para que regenerar no la pise.
const lectura = path.join(dirCorrida, 'lectura.md');
if (fs.existsSync(lectura)) md.push('---', '', fs.readFileSync(lectura, 'utf8'));
fs.writeFileSync(informe, md.join('\n'));
console.log(`\ninforme: ${path.relative(REPO, informe)}`);
// Cierre contra :3001: el proyecto de prueba queda archivado y `orquestar.py
// dormir` no deja entradas e2e-* en el hibernadas.json real (ahí sí escribe:
// el vigía de :3001 escucha ~/.cache/aos).
if (contraReal) {
  const lista = await (await apiReal('/projects?skipSynchronization=1')).json().catch(() => null);
  const proyectos = Array.isArray(lista) ? lista : (lista?.projects ?? lista?.data ?? []);
  const nuestro = proyectos.find((p) => [p.fullPath, p.path, p.project_path].includes(PROYECTO));
  const archivado = nuestro ? (await apiReal(`/projects/${encodeURIComponent(nuestro.projectId ?? nuestro.id)}`, { method: 'DELETE' })).ok : false;
  const rutaHib = path.join(os.homedir(), '.cache/aos/hibernadas.json');
  let sacadas = 0;
  try {
    const hib = JSON.parse(fs.readFileSync(rutaHib, 'utf8'));
    for (const k of Object.keys(hib)) if (k.startsWith(PREFIJO)) { delete hib[k]; sacadas += 1; }
    if (sacadas) {
      fs.writeFileSync(`${rutaHib}.tmp`, JSON.stringify(hib, null, 2));
      fs.renameSync(`${rutaHib}.tmp`, rutaHib);
    }
  } catch { /* sin hibernadas.json */ }
  console.log(`cierre :3001 — proyecto ${archivado ? 'archivado' : 'NO archivado (revisar a mano)'}, ${sacadas} e2e-* sacadas de hibernadas.json`);
}

const fallas = filas.filter((f) => f.resultado === 'falla').length;
process.exit(fallas ? 1 : 0);
