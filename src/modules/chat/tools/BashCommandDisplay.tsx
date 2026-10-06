import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Copy, Check } from 'lucide-react';

import { cn,copyTextToClipboard } from '@/shared/utils';
import { ToolStatusBadge } from '@/modules/chat/tools/ToolStatusBadge';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import type { ToolStatus } from '@/shared/types';

type BashCommandDisplayProps = {
  command: string;
  description?: string;
  /** Combined stdout/stderr from the tool result (empty while running). */
  output?: string;
  isError?: boolean;
  status?: ToolStatus;
  defaultOpen?: boolean;
};

/**
 * Línea de actividad para comandos de shell: una fila compacta con chevron,
 * sin tarjeta grande (design-system/branding.md — "la ausencia de cromo...
 * ninguna tarjeta grande por cada tool"; plan Fase 11, paso 2). El mismo
 * acento `border-l-2 pl-3` que usan `OneLineDisplay`/`CollapsibleDisplay`,
 * para que una tool de Bash se lea como una línea más, no como un panel
 * aparte. Cuando el comando produjo output, el detalle se pliega debajo,
 * indentado, en vez de dentro de una caja con fondo propio.
 *
 * Rendered by chat's ToolRenderer for shell tools (Bash and friends).
 */
export const BashCommandDisplay: React.FC<BashCommandDisplayProps> = ({
  command,
  description,
  output,
  isError = false,
  status,
  defaultOpen = false,
}) => {
  const { t } = useTranslation();
  const trimmedOutput = (output || '').replace(/\s+$/, '');
  const hasOutput = trimmedOutput.length > 0;
  const outputLineCount = hasOutput ? trimmedOutput.split('\n').length : 0;
  const isRunning = status === 'running';
  // `open` is raised by an effect once output arrives (below). A document is
  // rendered without effects, so it would show every command and no output.
  const isExporting = useIsExportingTranscript();
  const [openState, setOpen] = useState(false);
  const open = openState || isExporting;
  const [copied, setCopied] = useState(false);

  // Output often arrives after this component first mounts, so apply the
  // auto-open intent once when there is finally something to show. After that
  // the user is in control of the toggle. Errors intentionally do NOT
  // auto-expand — the red border and status badge already signal the failure,
  // and the output stays one click away.
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (!autoAppliedRef.current && hasOutput && defaultOpen) {
      autoAppliedRef.current = true;
      setOpen(true);
    }
  }, [hasOutput, defaultOpen]);

  const toggle = () => {
    if (hasOutput) {
      setOpen((prev) => !prev);
    }
  };

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const didCopy = await copyTextToClipboard(command);
    if (!didCopy) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'group/cmd my-0.5 border-l-2 py-0.5 pl-3 transition-colors duration-150',
        isError ? 'border-l-red-500 dark:border-l-red-400' : 'border-l-emerald-500/60 dark:border-l-emerald-400/60',
      )}
    >
      {/* Command header — clickable when there is output to expand */}
      <div
        role={hasOutput ? 'button' : undefined}
        tabIndex={hasOutput ? 0 : undefined}
        aria-expanded={hasOutput ? open : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (hasOutput && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggle();
          }
        }}
        className={cn(
          'flex items-center gap-2 outline-none',
          hasOutput && 'cursor-pointer focus-visible:ring-1 focus-visible:ring-ring',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70 transition-transform duration-200',
            open && 'rotate-90',
            !hasOutput && 'opacity-0',
          )}
        />
        <span className="flex-shrink-0 select-none font-mono text-xs font-semibold text-emerald-500 dark:text-emerald-400">
          $
        </span>
        {/* Not a <code> tag: the global `.chat-message code` rule forces
            `white-space: pre-wrap !important`, which would defeat `truncate`
            and render collapsed multi-line commands in full. */}
        <span
          className={cn(
            'min-w-0 flex-1 font-mono text-xs text-foreground',
            open ? 'whitespace-pre-wrap break-all' : 'truncate',
          )}
        >
          {command}
        </span>

        {isRunning && (
          <span className="h-2.5 w-2.5 flex-shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-emerald-400" />
        )}
        {status && status !== 'running' && <ToolStatusBadge status={status} className="flex-shrink-0" />}
        {!open && hasOutput && !isRunning && (
          <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/70 transition-opacity group-hover/cmd:opacity-0">
            {outputLineCount} {outputLineCount === 1 ? 'line' : 'lines'}
          </span>
        )}

        <button
          onClick={handleCopy}
          onKeyDown={(event) => event.stopPropagation()}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 transition-all hover:bg-foreground/10 hover:text-foreground focus:opacity-100 group-hover/cmd:opacity-100"
          title={t('chat:misc.copyCommand')}
          aria-label={t('chat:misc.copyCommand')}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {description && !open && (
        <div className="truncate pl-[18px] text-[11px] italic text-muted-foreground/70">
          {description}
        </div>
      )}

      {/* Expanded output — plegado debajo de la línea, sin caja propia. */}
      {open && hasOutput && (
        <div className="settings-content-enter mt-1 pl-[18px]">
          {description && (
            <div className="pb-1 text-[11px] italic text-muted-foreground/70">{description}</div>
          )}
          <pre
            className={cn(
              'max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed',
              isError ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
            )}
          >
            {trimmedOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
