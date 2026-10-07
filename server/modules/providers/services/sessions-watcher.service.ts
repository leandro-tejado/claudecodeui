import os from 'node:os';
import path from 'node:path';
import { promises as fsPromises, watch as watchFsNative, type FSWatcher as NativeFSWatcher } from 'node:fs';

import chokidar, { type FSWatcher } from 'chokidar';

import {
  invalidarRegistroSesiones,
  leerVivoEfectivoPorSesion,
  sesionesConVivoCambiado,
} from '@/modules/projects/index.js';
import { sessionSynchronizerService } from '@/modules/providers/services/session-synchronizer.service.js';
import {
  rutaRegistroSesionesTmux,
  sincronizarSesionesTmuxSinTranscript,
} from '@/modules/providers/services/tmux-registry-sessions.service.js';
import { crearVigiaTmux } from '@/modules/providers/services/vigia-tmux.service.js';
import {
  broadcastSessionUpsertedBatch,
  broadcastSidebarArchived,
  marcarTitulosAlArrancar,
  tmuxBridgeService,
} from '@/modules/websocket/index.js';
import { scheduleUsageWindowBroadcast } from '@/modules/usage-window/index.js';
import type { LLMProvider } from '@/shared/types.js';

type WatcherEventType = 'add' | 'change';

const PROVIDER_WATCH_PATHS: Array<{ provider: LLMProvider; rootPath: string }> = [
  {
    provider: 'claude',
    rootPath: path.join(os.homedir(), '.claude', 'projects'),
  },
  {
    provider: 'cursor',
    rootPath: path.join(os.homedir(), '.cursor', 'projects'),
  },
  {
    provider: 'codex',
    rootPath: path.join(os.homedir(), '.codex', 'sessions'),
  },
  {
    provider: 'opencode',
    rootPath: path.join(os.homedir(), '.local', 'share', 'opencode'),
  },
];

const WATCHER_IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/subagents/**',
  '**/tool-results/**',
  '**/*.tmp',
  '**/*.swp',
  '**/.DS_Store',
];

const PROJECTS_UPDATE_DEBOUNCE_MS = 500;
const PROJECTS_UPDATE_MAX_WAIT_MS = 2_000;

const watchers: FSWatcher[] = [];
/** Vigilantes nativos (`fs.watch`), aparte de los de chokidar: `.close()` existe en los dos, pero no comparten tipo. */
const nativeWatchers: NativeFSWatcher[] = [];

type PendingWatcherUpdate = {
  providers: Set<LLMProvider>;
  changeTypes: Set<WatcherEventType>;
  /**
   * Provider-native session ids reported by the synchronizers. They are
   * translated back to app-facing session rows at flush time, because the
   * transcript file names on disk only ever contain provider ids.
   */
  updatedSessionIds: Set<string>;
};

let pendingWatcherUpdate: PendingWatcherUpdate | null = null;
let pendingWatcherUpdateStartedAt: number | null = null;
let pendingWatcherFlushTimer: ReturnType<typeof setTimeout> | null = null;
let watcherRefreshInFlight = false;
let watcherRescheduleAfterRefresh = false;

/**
 * Filters watcher events to provider-specific session artifact file types.
 */
function isWatcherTargetFile(provider: LLMProvider, filePath: string): boolean {
  if (provider === 'opencode') {
    return path.basename(filePath) === 'opencode.db';
  }

  return filePath.endsWith('.jsonl');
}

function clearPendingWatcherFlushTimer(): void {
  if (pendingWatcherFlushTimer) {
    clearTimeout(pendingWatcherFlushTimer);
    pendingWatcherFlushTimer = null;
  }
}

function schedulePendingWatcherFlush(): void {
  if (!pendingWatcherUpdate) {
    return;
  }

  const now = Date.now();
  if (pendingWatcherUpdateStartedAt === null) {
    pendingWatcherUpdateStartedAt = now;
  }

  const elapsed = now - pendingWatcherUpdateStartedAt;
  const remainingMaxWait = Math.max(0, PROJECTS_UPDATE_MAX_WAIT_MS - elapsed);
  const delay = Math.min(PROJECTS_UPDATE_DEBOUNCE_MS, remainingMaxWait);

  clearPendingWatcherFlushTimer();
  pendingWatcherFlushTimer = setTimeout(() => {
    void flushPendingWatcherUpdate();
  }, delay);
}

function queuePendingWatcherUpdate(
  eventType: WatcherEventType,
  provider: LLMProvider,
  updatedSessionId: string | null
): void {
  if (!pendingWatcherUpdate) {
    pendingWatcherUpdate = {
      providers: new Set<LLMProvider>(),
      changeTypes: new Set<WatcherEventType>(),
      updatedSessionIds: new Set<string>(),
    };
  }

  pendingWatcherUpdate.providers.add(provider);
  pendingWatcherUpdate.changeTypes.add(eventType);
  if (updatedSessionId) {
    pendingWatcherUpdate.updatedSessionIds.add(updatedSessionId);
  }

  schedulePendingWatcherFlush();
}

async function flushPendingWatcherUpdate(): Promise<void> {
  clearPendingWatcherFlushTimer();

  if (!pendingWatcherUpdate) {
    return;
  }

  if (watcherRefreshInFlight) {
    watcherRescheduleAfterRefresh = true;
    return;
  }

  const queuedUpdate = pendingWatcherUpdate;
  pendingWatcherUpdate = null;
  pendingWatcherUpdateStartedAt = null;
  watcherRefreshInFlight = true;

  try {
    // Per-session deltas instead of full project snapshots: an upsert of one
    // session can never clobber unrelated client state, so the frontend needs
    // no "suppress updates while a run is active" protection logic.
    await broadcastSessionUpsertedBatch(queuedUpdate.updatedSessionIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Session watcher refresh failed while broadcasting session_upserted', { error: message });
  } finally {
    watcherRefreshInFlight = false;

    if (pendingWatcherUpdate || watcherRescheduleAfterRefresh) {
      watcherRescheduleAfterRefresh = false;
      schedulePendingWatcherFlush();
    }
  }
}

/**
 * Handles file watcher updates and triggers provider file-level synchronization.
 */
async function onUpdate(
  eventType: WatcherEventType,
  filePath: string,
  provider: LLMProvider
): Promise<void> {
  if (!isWatcherTargetFile(provider, filePath)) {
    return;
  }
  scheduleUsageWindowBroadcast();

  try {
    const result = await sessionSynchronizerService.synchronizeProviderFile(provider, filePath);
    if (!result.indexed) {
      return;
    }

    console.log(`Session synchronization triggered by ${eventType} event for provider "${provider}"`, {
      filePath,
      sessionId: result.sessionId,
    });
    queuePendingWatcherUpdate(eventType, provider, result.sessionId);

    // tmux-bridge mode (Fase 3): a session driven by `send-keys` has no
    // in-process run to stream from, so this file-change is the only signal
    // that new rows exist. No-ops for everything except a session that is
    // both Claude and currently backed by a live tmux pane — cheap to call
    // on every synced change because `manejarActualizacionTranscript` bails
    // out immediately (a single `tmux has-session`) for the common case
    // where nothing is bridged.
    if (provider === 'claude' && result.sessionId) {
      void tmuxBridgeService.manejarActualizacionTranscript(result.sessionId).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('tmux-bridge transcript update failed', { sessionId: result.sessionId, error: message });
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Session watcher sync failed for provider "${provider}"`, {
      eventType,
      filePath,
      error: message,
    });
  }
}

/**
 * Debounce compartido por los dos vigilantes de `~/.cache/aos` (el nativo de
 * abajo y el de respaldo por polling): no importa cuál disparó, los dos
 * terminan en la misma resincronización, y dos avisos pegados (Paso 2 de la
 * Fase 8: "el registro se reescribe con rename", que en algunos filesystems
 * llega partido en más de un evento) no la corren dos veces.
 */
const REGISTRO_SYNC_DEBOUNCE_MS = 200;
let registroSyncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRegistroSync(): void {
  if (registroSyncTimer) {
    return;
  }
  registroSyncTimer = setTimeout(() => {
    registroSyncTimer = null;
    void onRegistroDirectoryChange();
  }, REGISTRO_SYNC_DEBOUNCE_MS);
}

/**
 * Cada cuánto el vigía le pregunta a tmux qué panes siguen vivos. Un pane que
 * muere no escribe nada en `~/.cache/aos` (un `/exit`, un `kill-session`), así
 * que sin esta pasada periódica la barra no se enteraba hasta recargar.
 */
const VIGIA_TMUX_INTERVALO_MS = 10_000;
let vigiaTmuxTimer: ReturnType<typeof setInterval> | null = null;
const revisarVivoTmux = crearVigiaTmux({
  leerVivos: leerVivoEfectivoPorSesion,
  diferencias: sesionesConVivoCambiado,
});

/**
 * Bug del 07-oct: una sesión cuyo tmux murió o revivió seguía mostrando el
 * estado de la última carga. Las que cambiaron salen como `session_upserted`
 * con su `tmux` recalculado, y la fila pasa a libre o a dormida en vivo.
 */
async function avisarCambiosDeTmux(): Promise<void> {
  try {
    const cambiadas = await revisarVivoTmux();
    if (cambiadas.length === 0) {
      return;
    }
    // Sin esto el `session_upserted` saldría con el cache de 5 s del listado.
    invalidarRegistroSesiones();
    for (const sessionId of cambiadas) {
      queuePendingWatcherUpdate('change', 'claude', sessionId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Falló la revisión de los panes de tmux', { error: message });
  }
}

/**
 * Algo cambió en `~/.cache/aos`: una sesión nueva sin transcript todavía no
 * dispara ningún evento de `.jsonl`, así que esto es el único aviso de que
 * existe. No se filtra por nombre de archivo exacto — antes esto reaccionaba
 * solo a `sesiones.json`, pero `orquestar.py dormir` jamás lo reescribe: mata
 * el pane con `kill-session` y anota en `hibernadas.json` (mismo directorio,
 * para poder revivirla) sin tocar el registro de sesiones. Cualquier escritura
 * acá es señal de "resincronizá", y `sincronizarSesionesTmuxSinTranscript` ya
 * verifica el pane de verdad para las filas pendientes en vez de confiar en
 * el "viva" que pueda haber quedado desactualizado.
 *
 * Invalida el cache del listado para que el `session_upserted` salga con su
 * `tmux` ya resuelto.
 */
async function onRegistroDirectoryChange(): Promise<void> {
  try {
    invalidarRegistroSesiones();
    const { indexadas, reactivadas, podadas } = await sincronizarSesionesTmuxSinTranscript();
    if (indexadas.length > 0 || reactivadas.length > 0 || podadas.length > 0) {
      console.log('Sesiones tmux sin transcript sincronizadas desde el registro', { indexadas, reactivadas, podadas });
    }
    for (const sessionId of [...indexadas, ...reactivadas]) {
      queuePendingWatcherUpdate('add', 'claude', sessionId);
    }
    if (podadas.length > 0) {
      // La misma clase de delta que archivar a mano: la fila sale de la
      // barra abierta sin que nadie recargue (Fase 8, punto 4 — dormir o
      // cerrar afuera una sesión pendiente cambia su estado en vivo).
      broadcastSidebarArchived({ sessionIds: podadas });
    }
    // Una sesión que el orquestador despertó (o durmió) cambia el registro
    // sin ser nueva: su fila también tiene que enterarse.
    await avisarCambiosDeTmux();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Falló la sincronización del registro de tmux', { error: message });
  }
}

/**
 * Starts provider filesystem watchers and performs initial DB synchronization.
 */
export async function initializeSessionsWatcher(): Promise<void> {
  console.log('Setting up session watchers');

  const initialSync = await sessionSynchronizerService.synchronizeSessions();
  console.log('Initial session synchronization complete', {
    processedByProvider: initialSync.processedByProvider,
    prunedOrphans: initialSync.prunedOrphans,
    failures: initialSync.failures,
  });

  for (const { provider, rootPath } of PROVIDER_WATCH_PATHS) {
    try {
      await fsPromises.mkdir(rootPath, { recursive: true });

      const watcher = chokidar.watch(rootPath, {
        ignored: WATCHER_IGNORED_PATTERNS,
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        depth: 6,
        usePolling: true,
        interval: 6_000,
        binaryInterval: 6_000,
      });

      watcher
        .on('add', (filePath: string) => {
          void onUpdate('add', filePath, provider);
        })
        .on('change', (filePath: string) => {
          void onUpdate('change', filePath, provider);
        })
        .on('error', (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Session watcher error for provider "${provider}"`, { error: message });
        });

      watchers.push(watcher);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to initialize session watcher for provider "${provider}"`, {
        rootPath,
        error: message,
      });
    }
  }

  // La primera pasada toma la foto de referencia; las siguientes avisan.
  await avisarCambiosDeTmux();
  // Las sesiones quietas no producen upsert: su `@titulo` se marca acá.
  try {
    await marcarTitulosAlArrancar();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Falló el marcado de títulos de tmux al arrancar', { error: message });
  }
  vigiaTmuxTimer = setInterval(() => {
    void avisarCambiosDeTmux();
  }, VIGIA_TMUX_INTERVALO_MS);
  vigiaTmuxTimer.unref?.();

  // Se vigila el directorio, no el archivo: el registro se reescribe entero y
  // puede no existir todavía en una máquina donde el hook nunca corrió.
  const registroDirectory = path.dirname(rutaRegistroSesionesTmux());
  try {
    await fsPromises.mkdir(registroDirectory, { recursive: true });

    // Respaldo por polling (Paso 2 de la Fase 8): sigue existiendo para los
    // filesystems donde `fs.watch` nativo no es confiable (red, algunos
    // contenedores) — 3 s, igual que siempre.
    const registroWatcher = chokidar.watch(registroDirectory, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 0,
      usePolling: true,
      interval: 3_000,
    });
    registroWatcher
      .on('add', () => scheduleRegistroSync())
      .on('change', () => scheduleRegistroSync())
      .on('error', (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error en el watcher (polling, de respaldo) del registro de tmux', { error: message });
      });
    watchers.push(registroWatcher);

    // Vigilante nativo: dispara casi al instante en vez de esperar hasta 3 s
    // de polling, que es lo que medía la línea base como demora de una
    // sesión nueva del orquestador en aparecer en la barra. Sin filtrar por
    // nombre de archivo — ver el comentario de `onRegistroDirectoryChange`.
    const registroFsWatcher = watchFsNative(registroDirectory, { persistent: true }, () => {
      scheduleRegistroSync();
    });
    registroFsWatcher.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error en el fs.watch nativo del registro de tmux', { error: message });
    });
    nativeWatchers.push(registroFsWatcher);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('No se pudo vigilar el registro de tmux', { registroDirectory, error: message });
  }
}

/**
 * Stops all active provider session watchers.
 */
export async function closeSessionsWatcher(): Promise<void> {
  clearPendingWatcherFlushTimer();
  if (registroSyncTimer) {
    clearTimeout(registroSyncTimer);
    registroSyncTimer = null;
  }
  if (vigiaTmuxTimer) {
    clearInterval(vigiaTmuxTimer);
    vigiaTmuxTimer = null;
  }

  await Promise.all(
    watchers.map(async (watcher) => {
      try {
        await watcher.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Failed to close session watcher', { error: message });
      }
    })
  );
  watchers.length = 0;

  for (const watcher of nativeWatchers) {
    try {
      watcher.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to close native session watcher', { error: message });
    }
  }
  nativeWatchers.length = 0;

  pendingWatcherUpdate = null;
  pendingWatcherUpdateStartedAt = null;
  watcherRefreshInFlight = false;
  watcherRescheduleAfterRefresh = false;
}
