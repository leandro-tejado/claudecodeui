import { memo, useEffect } from 'react';

import type { ChatMessage } from '@/shared/types';
import {
  clearSubagentsForSession,
  closeSubagent,
  upsertSubagent,
  type SubagentStatus,
} from '@/modules/skin/subagentStore';

/*
 * Puente entre los `Task` del chat y las filas de subagentes del sidebar.
 *
 * No pinta nada, igual que `SkinContextMeterBridge`: mira la lista de mensajes
 * de la sesion activa, publica una fila por cada `Task` y listo. Toda la
 * decision visual (indentacion, punto de estado, icono) vive en el sidebar —
 * la Fase 5 la consume con `useSubagents()`.
 */

type SkinSubagentBridgeProps = {
  sessionId: string | null;
  messages: ChatMessage[];
};

/** `Task` guarda su `subagent_type`/`description`/`model` en el input, que ya
 * llega convertido a string por `normalizedToChatMessages`. El `subagent`
 * estructurado, cuando el servidor lo mando, siempre pisa lo que se pueda leer
 * de ahi. */
function readTaskInput(toolInput: unknown): { type: string; description: string; model?: string } {
  let raw: unknown = toolInput;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    type: typeof input.subagent_type === 'string' ? input.subagent_type : 'agent',
    description: typeof input.description === 'string' ? input.description : 'Subagent',
    model: typeof input.model === 'string' ? input.model : undefined,
  };
}

/** `running` mientras no haya `toolResult`; `completed`/`failed` cuando llega.
 * El `subagent.status` del servidor, cuando esta, manda sobre lo derivado. */
function deriveStatus(message: ChatMessage): SubagentStatus {
  const serverStatus = message.subagent?.status;
  if (serverStatus === 'running' || serverStatus === 'completed' || serverStatus === 'failed') {
    return serverStatus;
  }
  if (message.toolResult) {
    return message.toolResult.isError ? 'failed' : 'completed';
  }
  return 'running';
}

const toToolUseId = (message: ChatMessage): string | undefined => {
  if (typeof message.toolId === 'string' && message.toolId) return message.toolId;
  if (typeof message.toolCallId === 'string' && message.toolCallId) return message.toolCallId;
  return undefined;
};

const toStartedAt = (timestamp: ChatMessage['timestamp']): number => {
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
};

function SkinSubagentBridge({ sessionId, messages }: SkinSubagentBridgeProps) {
  useEffect(() => {
    if (!sessionId) return;

    for (const message of messages) {
      const toolUseId = toToolUseId(message);
      if (!toolUseId) continue;

      if (message.isToolUse && message.toolName === 'Task') {
        const input = readTaskInput(message.toolInput);
        upsertSubagent({
          toolUseId,
          sessionId,
          type: message.subagent?.type || input.type,
          description: message.subagent?.description || input.description,
          model: message.subagent?.model || input.model,
          status: deriveStatus(message),
          startedAt: toStartedAt(message.timestamp),
        });
        continue;
      }

      // Segundo cierre para los async: un agente que no corre en el mismo
      // turno no emite `tool_result` — el `task_notification` con el mismo
      // `toolUseId` cierra la fila igual.
      if (message.isTaskNotification) {
        closeSubagent(toolUseId, message.taskStatus === 'failed' ? 'failed' : 'completed');
      }
    }
  }, [sessionId, messages]);

  // Al desmontarse el chat (o cambiar de sesion), sus filas no pueden seguir
  // colgando de una sesion que ya no esta en pantalla.
  useEffect(() => () => {
    if (sessionId) clearSubagentsForSession(sessionId);
  }, [sessionId]);

  return null;
}

export default memo(SkinSubagentBridge);
