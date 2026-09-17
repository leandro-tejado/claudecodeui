export { WS_OPEN_STATE, connectedClients } from './services/websocket-state.service.js';
// Consumed by the projects module's session fetch (Fase 2, tmux badge): the
// fallback lookup key when a sesiones.json registry entry lacks a matching
// session_id.
export { nombreTmux } from './services/shell-websocket.service.js';
export { createWebSocketServer } from './services/websocket-server.service.js';
export { chatRunRegistry } from './services/chat-run-registry.service.js';
// Consumed by the providers module's sessions watcher, which announces the
// sessions it (re)indexed from disk through the same builder the chat gateway
// uses, so both paths put the identical delta on the wire.
export { broadcastSessionUpserted, broadcastSessionUpsertedBatch } from './services/session-upsert-broadcast.service.js';
// runDetachedChatTurn: used by the scheduled-messages module to run a turn
// from a timer, with no socket to stream to or report errors on.
export { runDetachedChatTurn } from './services/chat-websocket.service.js';
export type { ProviderRuntimeGateway } from './services/chat-websocket.service.js';
// Consumed by the providers module's sessions watcher (Fase 3): a tmux-bridged
// session has no in-process run to stream from, so the watcher is what tells
// this service a new transcript row may have landed.
export { tmuxBridgeService } from './services/tmux-bridge.service.js';
