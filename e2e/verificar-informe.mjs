#!/usr/bin/env node
// Verifica que cada fila de un informe tenga evidencia enlazada y que exista.
//   node e2e/verificar-informe.mjs e2e/evidencia/00-linea-base/informe.md
import fs from 'node:fs';
import path from 'node:path';

const informe = process.argv[2];
const dir = path.dirname(informe);
// Solo la tabla generada: la lectura humana (después de ---) tiene tablas propias.
const generado = fs.readFileSync(informe, 'utf8').split('\n---\n')[0];
const filas = generado.split('\n').filter((l) => /^\| `/.test(l));
const malas = [];
for (const fila of filas) {
  const celdas = fila.split(/(?<!\\)\|/);
  const resultado = celdas[3] ?? '';
  const links = [...(celdas[4] ?? '').matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  if (resultado.includes('bloqueado')) continue;
  if (!links.length) malas.push(`sin evidencia: ${celdas[1].trim()} — ${celdas[2].trim()}`);
  for (const l of links) if (!fs.existsSync(path.join(dir, l))) malas.push(`no existe ${l}`);
}
console.log(`${filas.length} filas, ${malas.length} problemas`);
for (const m of malas) console.log(`  ${m}`);
process.exit(malas.length ? 1 : 0);
