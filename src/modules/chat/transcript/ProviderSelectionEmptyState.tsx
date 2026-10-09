import React from "react";
import { useTranslation } from "react-i18next";

import type {
  ProjectSession,
  LLMProvider,
  ProviderModelActions,
  ProviderModelsDefinition,
} from "@/shared/types";
import { NextTaskBanner } from "@/modules/task-master";

type ProviderSelectionEmptyStateProps = {
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  provider: LLMProvider;
  setProvider: (next: LLMProvider) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  providerModels: Record<LLMProvider, string>;
  /** Records the pick as this provider's default and persists it. */
  setProviderModel: (provider: LLMProvider, model: string) => void;
  providerModelCatalog: Partial<Record<LLMProvider, ProviderModelsDefinition>>;
  providerModelActions: ProviderModelActions;
  providerModelsLoading: boolean;
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  onShowAllTasks?: (() => void) | null;
  setInput: React.Dispatch<React.SetStateAction<string>>;
};

/**
 * Rendered by chat's ChatMessagesPane when a session has no messages yet.
 *
 * Desde el rediseño del 9-oct el estado vacío no explica nada: no hay
 * «Elige tu asistente», ni tarjeta de proveedor, ni «Listo para usar…», ni la
 * pista de Ctrl+K. Hay un solo proveedor (Claude) y el modelo se elige en el
 * menú único del compositor, así que acá solo queda la próxima tarea de
 * TaskMaster cuando está instalado. El resto de las props se conserva para no
 * tocar a quien lo monta.
 */
export default function ProviderSelectionEmptyState({
  selectedSession,
  currentSessionId,
  provider,
  tasksEnabled,
  isTaskMasterInstalled,
  onShowAllTasks,
  setInput,
}: ProviderSelectionEmptyStateProps) {
  const { t } = useTranslation("chat");

  const nextTaskPrompt = t("tasks.nextTaskPrompt", {
    defaultValue: "Start the next task",
  });

  if (!selectedSession && !currentSessionId && !provider) return null;
  if (!tasksEnabled || !isTaskMasterInstalled) return null;

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-[34.25rem]">
        <NextTaskBanner
          onStartTask={() => setInput(nextTaskPrompt)}
          onShowAllTasks={onShowAllTasks}
        />
      </div>
    </div>
  );
}
