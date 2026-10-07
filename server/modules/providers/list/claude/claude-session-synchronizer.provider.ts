import os from 'node:os';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import readline from 'node:readline';

import { sessionsDb } from '@/modules/database/index.js';
import { tituloHumano } from '@/modules/providers/services/titulo-humano.js';
import {
  buildLookupMap,
  extractFirstValidJsonlData,
  findFilesRecursivelyCreatedAfter,
  normalizeSessionName,
  readFileTimestamps,
} from '@/shared/utils.js';
import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';

type ParsedSession = {
  sessionId: string;
  projectPath: string;
  sessionName?: string;
  /** `provisorio`: título humano del primer mensaje, que el `ai-title` todavía puede mejorar. */
  estadoNombre?: 'provisorio' | 'definitivo';
  /** 'cli' | 'sdk-ts' | 'sdk-cli'; undefined si las primeras líneas no lo traen. */
  entrypoint?: string;
};

/** Lo que el transcript dice sobre el nombre de la sesión. */
type TitulosDelTranscript = {
  customTitle?: string;
  aiTitle?: string;
  firstPrompt?: string;
  lastPrompt?: string;
};

/**
 * Un nombre bloqueado que parece el prompt crudo (bug del 07-oct): un slash
 * command, el modo bash o un mensaje largo. Solo esos justifican leer el
 * transcript entero para ver si hay que repararlos.
 */
function pareceCrudo(nombre: string): boolean {
  return /^[/!<]/.test(nombre.trim()) || nombre.length > 60;
}

function mismoTexto(nombre: string, prompt: string): boolean {
  const a = nombre.replace(/\s+/g, ' ').trim();
  const b = prompt.replace(/\s+/g, ' ').trim();
  return a.length > 0 && (a === b || b.startsWith(a) || a.startsWith(b));
}

/** Líneas del arranque del .jsonl donde Claude Code deja `entrypoint`; no hace falta leer más. */
const ENTRYPOINT_SCAN_LINES = 10;

/**
 * Session indexer for Claude transcript artifacts.
 */
export class ClaudeSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'claude' as const;
  private readonly claudeHome = path.join(os.homedir(), '.claude');

  /**
   * Returns true when a JSONL file is a subagent transcript or tool result
   * rather than a top-level session.
   *
   * Claude stores subagent transcripts under a `subagents/` directory and
   * tool results under a `tool-results/` directory, e.g.
   * `~/.claude/projects/<encoded-cwd>/<session-id>/subagents/agent-<id>.jsonl`.
   * Those files repeat the parent session's `sessionId`, so indexing them as
   * standalone sessions overwrites the parent row's `jsonl_path` and corrupts
   * the main session record. The recursive scan in `synchronize()` reaches
   * them, so both entry points must skip them.
   */
  private isSubagentTranscript(filePath: string): boolean {
    const pathParts = path.normalize(filePath).split(path.sep);
    return pathParts.includes('subagents') || pathParts.includes('tool-results');
  }

  /**
   * Scans ~/.claude/projects and upserts discovered sessions into DB.
   */
  async synchronize(since?: Date): Promise<number> {
    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const files = await findFilesRecursivelyCreatedAfter(
      path.join(this.claudeHome, 'projects'),
      '.jsonl',
      since ?? null
    );

    let processed = 0;
    for (const filePath of files) {
      if (this.isSubagentTranscript(filePath)) {
        continue;
      }

      const parsed = await this.processSessionFile(filePath, nameMap);
      if (!parsed) {
        continue;
      }

      const timestamps = await readFileTimestamps(filePath);
      sessionsDb.createSession(
        parsed.sessionId,
        this.provider,
        parsed.projectPath,
        parsed.sessionName,
        timestamps.createdAt,
        timestamps.updatedAt,
        filePath,
        parsed.entrypoint,
        parsed.estadoNombre
      );
      processed += 1;
    }

    return processed;
  }

  /**
   * Parses and upserts one Claude session JSONL file.
   */
  async synchronizeFile(filePath: string): Promise<string | null> {
    if (!filePath.endsWith('.jsonl')) {
      return null;
    }
    if (this.isSubagentTranscript(filePath)) {
      return null;
    }

    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const parsed = await this.processSessionFile(filePath, nameMap);
    if (!parsed) {
      return null;
    }

    const timestamps = await readFileTimestamps(filePath);
    return sessionsDb.createSession(
      parsed.sessionId,
      this.provider,
      parsed.projectPath,
      parsed.sessionName,
      timestamps.createdAt,
      timestamps.updatedAt,
      filePath,
      parsed.entrypoint,
      parsed.estadoNombre
    );
  }

  /**
   * Extracts session metadata from one Claude JSONL session file.
   */
  private async processSessionFile(
    filePath: string,
    nameMap: Map<string, string>
  ): Promise<ParsedSession | null> {
    const parsed = await extractFirstValidJsonlData(filePath, (rawData) => {
      const data = rawData as Record<string, unknown>;
      const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
      const projectPath = typeof data.cwd === 'string' ? data.cwd : undefined;

      if (!sessionId || !projectPath) {
        return null;
      }

      return {
        sessionId,
        projectPath,
      };
    });

    if (!parsed) {
      return null;
    }

    const entrypoint = await this.extractEntrypoint(filePath);
    const withEntrypoint = (session: ParsedSession): ParsedSession =>
      (entrypoint ? { ...session, entrypoint } : session);

    // App-created sessions are keyed by an app id, so disk-discovered provider
    // ids must be resolved through the provider-id mapping first.
    const existingSession = sessionsDb.getSessionByProviderSessionId(parsed.sessionId)
      ?? sessionsDb.getSessionById(parsed.sessionId);
    const existingSessionName = existingSession?.custom_name;
    // A locked name (any name that isn't still an app-guessed placeholder —
    // see `custom_name_is_placeholder`) is never touched again: either a
    // synchronizer already upgraded it once, or the user renamed it.
    const isLocked = Boolean(existingSessionName)
      && existingSessionName !== 'Untitled Claude Session'
      && !existingSession?.custom_name_is_placeholder;
    const keepLockedName = () => withEntrypoint({
      ...parsed,
      sessionName: normalizeSessionName(existingSessionName ?? undefined, 'Untitled Claude Session'),
    });
    if (isLocked && !pareceCrudo(existingSessionName!)) {
      return keepLockedName();
    }

    const titulos = await this.extractSessionTitles(filePath, parsed.sessionId);
    const historyName = nameMap.get(parsed.sessionId);

    if (isLocked) {
      // Reparación del bug del 07-oct: el sync viejo bloqueaba el primer
      // `last-prompt` que veía. Solo se reabre si el nombre es literalmente
      // un prompt del transcript y nadie hizo `/rename` — un renombrado de
      // Leandro nunca se toca.
      const esPromptCrudo = !titulos.customTitle
        && [titulos.firstPrompt, titulos.lastPrompt, historyName]
          .some((prompt) => prompt && mismoTexto(existingSessionName!, prompt));
      if (!esPromptCrudo) {
        return keepLockedName();
      }
      sessionsDb.desbloquearNombreCrudo(existingSession!.session_id);
    }

    const elegido = this.elegirTitulo(titulos, historyName, parsed.projectPath);
    if (!elegido) {
      if (existingSessionName) {
        // Nothing better on disk yet (common right after the session is
        // created). Report "no update" rather than the generic fallback
        // label, so `createSession` leaves the existing name untouched
        // instead of downgrading it to "Untitled Claude Session". A row with
        // no name at all yet still falls through to the fallback below.
        return withEntrypoint({ ...parsed, sessionName: undefined });
      }
      return withEntrypoint({ ...parsed, sessionName: normalizeSessionName(undefined, 'Untitled Claude Session') });
    }

    return withEntrypoint({
      ...parsed,
      sessionName: normalizeSessionName(elegido.titulo, 'Untitled Claude Session'),
      estadoNombre: elegido.definitivo ? 'definitivo' : 'provisorio',
    });
  }

  /**
   * El nombre que corresponde según el transcript, en este orden:
   *
   * 1. `custom-title` (un `/rename` en el CLI): definitivo.
   * 2. El título del plan, si el primer mensaje es un comando de plan:
   *    definitivo, y gana sobre el `ai-title` (pedido del 07-oct).
   * 3. `ai-title`, que Claude Code genera solo: definitivo.
   * 4. El título humano del primer mensaje (`tituloHumano`), o del último o
   *    del historial si el primero no está: provisorio, así el `ai-title`
   *    que llegue después lo mejora una vez. Nunca el prompt crudo.
   */
  private elegirTitulo(
    titulos: TitulosDelTranscript,
    historyName: string | undefined,
    projectPath: string,
  ): { titulo: string; definitivo: boolean } | null {
    if (titulos.customTitle?.trim()) {
      return { titulo: titulos.customTitle, definitivo: true };
    }
    const delPrimerMensaje = titulos.firstPrompt ? tituloHumano(titulos.firstPrompt, { cwd: projectPath }) : null;
    if (delPrimerMensaje?.definitivo) {
      return delPrimerMensaje;
    }
    if (titulos.aiTitle?.trim()) {
      return { titulo: titulos.aiTitle, definitivo: true };
    }
    for (const candidato of [titulos.firstPrompt, titulos.lastPrompt, historyName]) {
      const titulo = candidato ? tituloHumano(candidato, { cwd: projectPath }) : null;
      if (titulo) {
        return titulo;
      }
    }
    return null;
  }

  /**
   * Lee `entrypoint` de las primeras líneas del transcript: `'cli'` (tmux/`ct`),
   * `'sdk-ts'` (chat de CloudCLI) o `'sdk-cli'` (`claude -p` headless).
   *
   * Lectura acotada: corta a las `ENTRYPOINT_SCAN_LINES` líneas con contenido,
   * sin cargar el archivo entero (los transcripts llegan a decenas de MB).
   * Devuelve undefined si no aparece o el archivo no se puede leer; la fila
   * queda con NULL y la próxima sincronización lo reintenta.
   */
  private async extractEntrypoint(filePath: string): Promise<string | undefined> {
    const fileStream = createReadStream(filePath);
    const lineReader = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    try {
      let scanned = 0;
      for await (const line of lineReader) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        scanned += 1;
        try {
          const data = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof data.entrypoint === 'string' && data.entrypoint.trim()) {
            return data.entrypoint.trim();
          }
        } catch {
          // Una línea truncada no invalida las siguientes.
        }

        if (scanned >= ENTRYPOINT_SCAN_LINES) {
          break;
        }
      }
    } catch {
      // Archivo ausente o ilegible: sin entrypoint, el sync sigue.
    } finally {
      lineReader.close();
      fileStream.destroy();
    }

    return undefined;
  }

  /**
   * Everything the transcript says about the session's name.
   *
   * Scans forward keeping the last match of each bookkeeping event type
   * (Claude writes `custom-title` immediately before `ai-title`, so a reverse
   * scan that returns its first hit would always lose the manual rename),
   * plus the first real user message — the one the human title comes from.
   *
   * Returns an empty object on a missing or unreadable file so sync can continue.
   */
  private async extractSessionTitles(
    filePath: string,
    sessionId: string
  ): Promise<TitulosDelTranscript> {
    const titulos: TitulosDelTranscript = {};
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]?.trim();
        if (!line) {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        const data = parsed as Record<string, unknown>;
        const eventType = typeof data.type === 'string' ? data.type : undefined;
        const eventSessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;

        if (eventSessionId !== sessionId) {
          continue;
        }

        if (eventType === 'custom-title') {
          const title = typeof data.customTitle === 'string' ? data.customTitle : undefined;
          if (title?.trim()) {
            titulos.customTitle = title;
          }
        } else if (eventType === 'ai-title') {
          const title = typeof data.aiTitle === 'string' ? data.aiTitle : undefined;
          if (title?.trim()) {
            titulos.aiTitle = title;
          }
        } else if (eventType === 'last-prompt') {
          const prompt = typeof data.lastPrompt === 'string' ? data.lastPrompt : undefined;
          if (prompt?.trim()) {
            titulos.lastPrompt = prompt;
          }
        } else if (eventType === 'user' && titulos.firstPrompt === undefined && data.isMeta !== true) {
          const texto = textoDeMensajeDeUsuario(data.message);
          if (texto) {
            titulos.firstPrompt = texto;
          }
        }
      }
    } catch {
      // Ignore missing/unreadable files so sync can continue.
    }

    return titulos;
  }
}

/**
 * El texto que escribió la persona en un mensaje `user` del transcript, o
 * `undefined` si no es eso: resultados de herramientas, la salida de un
 * comando local o el aviso que Claude Code antepone a esa salida.
 */
function textoDeMensajeDeUsuario(message: unknown): string | undefined {
  const content = (message as { content?: unknown } | undefined)?.content;
  let texto: string | undefined;
  if (typeof content === 'string') {
    texto = content;
  } else if (Array.isArray(content)) {
    texto = content
      .filter((bloque): bloque is { type: 'text'; text: string } =>
        (bloque as { type?: unknown })?.type === 'text' && typeof (bloque as { text?: unknown }).text === 'string')
      .map((bloque) => bloque.text)
      .join('\n');
  }
  texto = texto?.trim();
  if (!texto || /^<local-command|^Caveat:/.test(texto)) {
    return undefined;
  }
  return texto;
}
