import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/shared/utils';
import { Markdown } from '@/modules/chat/transcript/Markdown';

type ToolErrorDisplayProps = {
  /** Full error text; rendered as markdown when expanded. */
  content: string;
  /** Localized "Error" label shown in the header. */
  label: string;
};

/**
 * Línea de actividad para un resultado de error (tools no-Bash): la misma
 * fila con chevron y acento `border-l-2 pl-3` que `BashCommandDisplay`, sin
 * caja ni fondo propios (design-system/branding.md, plan Fase 11 paso 2 —
 * "nada de tarjetas grandes por cada tool"). El rojo del borde y el label ya
 * señalan el error; el detalle completo queda un clic más allá.
 *
 * Rendered by chat's MessageComponent for failed tool results.
 */
export const ToolErrorDisplay: React.FC<ToolErrorDisplayProps> = ({ content, label }) => {
  const trimmedContent = content.trim();
  const hasContent = trimmedContent.length > 0;
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (hasContent) {
      setOpen((prev) => !prev);
    }
  };

  return (
    <div className="my-1 border-l-2 border-l-red-500 py-0.5 pl-3 dark:border-l-red-400">
      <div
        role={hasContent ? 'button' : undefined}
        tabIndex={hasContent ? 0 : undefined}
        aria-expanded={hasContent ? open : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (hasContent && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggle();
          }
        }}
        className={cn(
          'flex items-center gap-2 outline-none',
          hasContent && 'cursor-pointer focus-visible:ring-1 focus-visible:ring-ring',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-red-500/70 transition-transform duration-200 dark:text-red-400/70',
            open && 'rotate-90',
            !hasContent && 'opacity-0',
          )}
        />
        <svg
          className="h-3.5 w-3.5 flex-shrink-0 text-red-500 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="flex-shrink-0 text-xs font-medium text-red-700 dark:text-red-300">{label}</span>
        {!open && hasContent && (
          /* Not a <code>/<pre> tag: the global `.chat-message code` rule forces
             `white-space: pre-wrap !important`, which would defeat `truncate`. */
          <span className="min-w-0 flex-1 truncate text-xs text-red-900/70 dark:text-red-100/70">
            {trimmedContent}
          </span>
        )}
      </div>

      {open && hasContent && (
        <div className="settings-content-enter mt-1.5 pl-[18px] text-sm text-red-900 dark:text-red-100">
          <Markdown className="prose prose-sm prose-red max-w-none font-sans dark:prose-invert">
            {trimmedContent}
          </Markdown>
        </div>
      )}
    </div>
  );
};
