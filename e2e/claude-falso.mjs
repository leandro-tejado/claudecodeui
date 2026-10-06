#!/usr/bin/env node
// CLI de Claude Code falso para la instancia :3902 (CLAUDE_CLI_PATH).
// Habla el mismo stream-json que el SDK espera del CLI real y escribe el
// transcript JSONL como el real, así CloudCLI lo trata igual. No gasta cuota.
//
// El guion sale del prompt: "guion:<nombre>". Sin guion, corre `humo`.
// Guiones: humo, lento, pensamiento, subagente-a-mitad, stderr-a-mitad,
//          6000-deltas, pregunta.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const LOG = path.join(process.env.E2E_RAIZ || '/tmp/cloudcli-e2e', 'falso.log');
const argv = process.argv.slice(2);
const log = (...x) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${x.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')}\n`); } catch { /* sin log */ } };
log('argv', argv);

const arg = (nombre) => { const i = argv.indexOf(nombre); return i >= 0 ? argv[i + 1] : undefined; };
const sessionId = arg('--resume') || arg('--session-id') || crypto.randomUUID();
// Un escenario que después sigue la sesión con el Claude real necesita un modelo de verdad.
const modelo = process.env.E2E_FALSO_MODELO || 'claude-falso-1';
const cwd = process.cwd();
const dirTranscript = path.join(os.homedir(), '.claude/projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
const transcript = path.join(dirTranscript, `${sessionId}.jsonl`);
fs.mkdirSync(dirTranscript, { recursive: true });

let ultimoUuid = null;
const pendientes = new Map(); // request_id -> resolve, para can_use_tool

const enviar = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

function fila(tipo, message, extra = {}) {
  const u = uuid();
  const row = {
    parentUuid: ultimoUuid, isSidechain: false, userType: 'external', cwd, sessionId,
    // sdk-cli: no es actividad interactiva, así que la limpieza de :3001 (que
    // comparte ~/.claude) no le da al proyecto de prueba un lugar del tope.
    version: '2.0.0-falso', gitBranch: '', entrypoint: 'sdk-cli', type: tipo, message, uuid: u,
    timestamp: new Date().toISOString(), ...extra,
  };
  fs.appendFileSync(transcript, `${JSON.stringify(row)}\n`);
  ultimoUuid = u;
  return u;
}

const uso = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const ev = (event, parent = null) => enviar({ type: 'stream_event', event, session_id: sessionId, parent_tool_use_id: parent, uuid: uuid() });

// Un mensaje assistant completo: stream_events de cada bloque y, por bloque,
// la fila del JSONL y el mensaje `assistant` (así lo hace el CLI real).
async function mensaje(bloques, { pausa = 40, parent = null, stopReason = 'end_turn', alMedio, cadaTanda, pausaTanda } = {}) {
  const id = `msg_falso_${crypto.randomBytes(6).toString('hex')}`;
  const base = { id, type: 'message', role: 'assistant', model: modelo, stop_reason: null, usage: uso };
  ev({ type: 'message_start', message: { ...base, content: [] } }, parent);
  const bloquesFinales = [];
  for (let index = 0; index < bloques.length; index++) {
    const b = bloques[index];
    if (b.type === 'text' || b.type === 'thinking') {
      const campo = b.type === 'text' ? 'text' : 'thinking';
      ev({ type: 'content_block_start', index, content_block: { type: b.type, [campo]: '' } }, parent);
      const trozos = b.trozos ?? b[campo].match(/.{1,6}/gs) ?? [];
      for (let i = 0; i < trozos.length; i++) {
        ev({ type: 'content_block_delta', index, delta: { type: b.type === 'text' ? 'text_delta' : 'thinking_delta', [campo]: trozos[i] } }, parent);
        if (alMedio && index === bloques.length - 1 && i === Math.floor(trozos.length / 2)) await alMedio();
        if (pausa) await dormir(pausa);
        if (cadaTanda && (i + 1) % cadaTanda === 0) await dormir(pausaTanda);
      }
      ev({ type: 'content_block_stop', index }, parent);
    } else if (b.type === 'tool_use') {
      ev({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }, parent);
      ev({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }, parent);
      ev({ type: 'content_block_stop', index }, parent);
    }
    bloquesFinales.push(
      b.type === 'text' ? { type: 'text', text: b.text }
        : b.type === 'thinking' ? { type: 'thinking', thinking: b.thinking, signature: 'falso' }
          : { type: 'tool_use', id: b.id, name: b.name, input: b.input },
    );
  }
  // Un solo evento "assistant" al final, con TODOS los bloques juntos en
  // `content` — así es como el SDK real cierra un mensaje de varios bloques
  // (protocolo-streaming.md: el server deriva el blockIndex de cada parte de
  // su posición dentro de `message.content`). Mandar un evento por bloque,
  // cada uno con `content` de un solo elemento, hacía que el server
  // recalculara el índice desde 0 en cada uno: dos bloques sin tool_use de
  // por medio (p. ej. thinking + text, guion `pensamiento`) terminaban con
  // el mismo (messageId, blockIndex) y por lo tanto la misma fila —
  // encontrado al correr `headless/actividad` en Fase 5.
  const msg = { ...base, content: bloquesFinales, stop_reason: stopReason };
  fila('assistant', msg, { requestId: `req_falso_${id}`, ...(parent ? { isSidechain: true } : {}) });
  enviar({ type: 'assistant', message: msg, parent_tool_use_id: parent, session_id: sessionId, uuid: ultimoUuid });
  ev({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: uso }, parent);
  ev({ type: 'message_stop' }, parent);
  return id;
}

function resultadoHerramienta(toolUseId, contenido, toolUseResult) {
  const msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: contenido }] };
  fila('user', msg, toolUseResult ? { toolUseResult } : {});
  enviar({ type: 'user', message: msg, parent_tool_use_id: null, session_id: sessionId, uuid: ultimoUuid });
}

function pedirPermiso(toolName, input, toolUseId) {
  const requestId = `req_${uuid()}`;
  enviar({ type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: toolName, input, tool_use_id: toolUseId, permission_suggestions: [] } });
  return new Promise((resolve) => pendientes.set(requestId, resolve));
}

const textoLargo = 'Uno dos tres cuatro cinco seis siete ocho nueve diez. '.repeat(4).trim();
// "nonce:abc" en el prompt marca la respuesta, para poder contar repetidos.
let nonce = '';
const marca = (t) => (nonce ? `${t} [${nonce}]` : t);

const GUIONES = {
  async humo() {
    await mensaje([{ type: 'text', text: marca('Hola desde el CLI falso. Esto llega de a poco.') }]);
  },
  async lento() {
    await mensaje([{ type: 'text', text: marca(textoLargo) }], { pausa: 120 });
  },
  async pensamiento() {
    await dormir(1500); // ventana sin tokens: ahí tiene que verse el indicador
    await mensaje([
      { type: 'thinking', thinking: 'Estoy pensando en voz alta antes de contestar, paso por paso.' },
      { type: 'text', text: marca('Respuesta después de pensar.') },
    ], { pausa: 80 });
  },
  async 'subagente-a-mitad'() {
    const tid = `toolu_falso_${crypto.randomBytes(4).toString('hex')}`;
    await mensaje([
      { type: 'text', text: 'Delego una tarea en segundo plano.' },
      { type: 'tool_use', id: tid, name: 'Agent', input: { description: 'Tarea falsa', prompt: 'contar', subagent_type: 'general-purpose', run_in_background: true } },
    ], { stopReason: 'tool_use' });
    resultadoHerramienta(tid, 'Async agent launched successfully.');
    await mensaje([{ type: 'text', text: marca(`Mientras tanto sigo escribiendo la respuesta principal. ${textoLargo}`) }], {
      pausa: 60,
      alMedio: async () => {
        // Mensajes del subagente a mitad del bloque principal.
        await mensaje([{ type: 'text', text: 'Soy el subagente y hablo en el medio.' }], { pausa: 0, parent: tid });
        enviar({ type: 'system', subtype: 'task_notification', task_id: tid, status: 'running', summary: 'Tarea falsa', session_id: sessionId, uuid: uuid() });
      },
    });
  },
  async 'stderr-a-mitad'() {
    await mensaje([{ type: 'text', text: marca(`Una respuesta que se cruza con stderr. ${textoLargo}`) }], {
      pausa: 60,
      alMedio: async () => { process.stderr.write('[falso] advertencia en stderr a mitad del bloque\n'); },
    });
  },
  async '6000-deltas'() {
    const trozos = Array.from({ length: 6000 }, (_, i) => (i % 100 === 99 ? `${i + 1}\n` : 'x '));
    // En tandas de 100 con 50 ms entre tandas (~3 s): da tiempo a recargar a mitad.
    await mensaje([{ type: 'text', text: trozos.join(''), trozos }], { pausa: 0, cadaTanda: 100, pausaTanda: 50 });
  },
  async pregunta() {
    const tid = `toolu_falso_${crypto.randomBytes(4).toString('hex')}`;
    const input = {
      questions: [
        { question: '¿Qué color preferís?', header: 'Color', multiSelect: false, options: [{ label: 'Rojo', description: 'cálido' }, { label: 'Azul', description: 'frío' }, { label: 'Verde', description: 'neutro' }] },
        { question: '¿Qué frutas querés?', header: 'Frutas', multiSelect: true, options: [{ label: 'Manzana', description: '' }, { label: 'Pera', description: '' }, { label: 'Uva', description: '' }] },
        { question: 'Elegí "una" opción con comillas', header: 'Comillas', multiSelect: false, options: [{ label: 'Sí', description: '' }, { label: 'No', description: '' }] },
      ],
    };
    await mensaje([{ type: 'tool_use', id: tid, name: 'AskUserQuestion', input }], { stopReason: 'tool_use' });
    const r = await pedirPermiso('AskUserQuestion', input, tid);
    const respuestas = r?.updatedInput?.answers ?? {};
    const texto = Object.entries(respuestas).map(([q, a]) => `"${q}"="${a}"`).join(', ');
    resultadoHerramienta(tid, `User has answered your questions: ${texto}. You can now continue with the user's answers in mind.`, { questions: input.questions, answers: respuestas });
    await mensaje([{ type: 'text', text: `Elegiste: ${Object.values(respuestas).join(' | ') || '(nada)'}` }]);
  },
};

async function turno(textoUsuario, contenido) {
  const t0 = Date.now();
  fila('user', { role: 'user', content: contenido });
  const m = /guion:([\w-]+)/.exec(textoUsuario);
  const nombre = m && GUIONES[m[1]] ? m[1] : 'humo';
  nonce = (/nonce:([\w-]+)/.exec(textoUsuario) || [])[1] ?? '';
  log('turno', { sessionId, guion: nombre });
  // Título con el nonce: la barra muestra este y así cada sesión de prueba se distingue por texto.
  fs.appendFileSync(transcript, `${JSON.stringify({ type: 'ai-title', aiTitle: `Guion ${nombre}${nonce ? ` ${nonce}` : ''}`, sessionId, entrypoint: 'sdk-cli' })}\n`);
  await GUIONES[nombre]();
  enviar({
    type: 'result', subtype: 'success', is_error: false, duration_ms: Date.now() - t0, duration_api_ms: Date.now() - t0,
    num_turns: 1, result: 'ok', session_id: sessionId, total_cost_usd: 0, usage: uso, modelUsage: {},
    permission_denials: [], uuid: uuid(),
  });
}

enviar({
  type: 'system', subtype: 'init', session_id: sessionId, cwd, tools: ['Agent', 'AskUserQuestion', 'Bash', 'Read'],
  mcp_servers: [], model: modelo, permissionMode: arg('--permission-mode') || 'default', slash_commands: [],
  apiKeySource: 'none', claude_code_version: '2.0.0-falso', output_style: 'default', agents: [], skills: [], plugins: [], uuid: uuid(),
});

const rl = readline.createInterface({ input: process.stdin });
let cola = Promise.resolve();
rl.on('line', (linea) => {
  let msg;
  try { msg = JSON.parse(linea); } catch { return; }
  log('in', msg.type, msg.request?.subtype ?? msg.response?.subtype ?? '');
  if (msg.type === 'control_request') {
    // initialize, set_permission_mode, interrupt, etc.: todo se acepta.
    enviar({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response: msg.request?.subtype === 'initialize' ? { commands: [], output_style: 'default', available_output_styles: ['default'], models: [], account: {} } : {} } });
    if (msg.request?.subtype === 'interrupt') process.exit(0);
    return;
  }
  if (msg.type === 'control_response') {
    const id = msg.response?.request_id;
    const resolver = pendientes.get(id);
    if (resolver) { pendientes.delete(id); resolver(msg.response?.response); }
    return;
  }
  if (msg.type === 'user') {
    const c = msg.message?.content;
    const texto = typeof c === 'string' ? c : (Array.isArray(c) ? c.map((b) => b.text ?? '').join(' ') : '');
    cola = cola.then(() => turno(texto, c)).catch((e) => log('error', String(e)));
  }
});
rl.on('close', () => { cola.then(() => process.exit(0)); });

// Modo -p "<prompt>" (sin stream de entrada).
const p = arg('-p') ?? arg('--print');
if (p && !argv.includes('--input-format')) cola = cola.then(() => turno(p, p)).then(() => process.exit(0));
