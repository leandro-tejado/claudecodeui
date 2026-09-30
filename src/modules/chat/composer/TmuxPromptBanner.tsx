import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TerminalSquareIcon } from 'lucide-react';

import type { TmuxPrompt } from '@/modules/skin';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/modules/chat/composer/Confirmation';

type TmuxPromptBannerProps = {
  prompts: TmuxPrompt[];
  errors: ReadonlyMap<string, { promptId: string; error: string }>;
  onAnswer: (prompt: TmuxPrompt, optionIndex: number, text?: string) => void;
};

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * La pregunta que un pane de tmux le está haciendo a la persona, con un botón
 * por opción. Cada botón teclea esa opción en el pane (el servidor revisa
 * antes que la pregunta siga siendo la misma). Mientras el pane no la saca de
 * pantalla, la tarjeta queda con "Enviando…"; si el servidor la rechaza,
 * vuelve a estar disponible con el motivo.
 *
 * La opción libre de AskUserQuestion ("Type something.") no es un botón sino
 * un campo: la respuesta se escribe acá y el servidor la teclea en el pane.
 */
export default function TmuxPromptBanner({ prompts, errors, onAnswer }: TmuxPromptBannerProps) {
  const { t } = useTranslation('chat');
  // promptId -> la opción mandada y el error que había en ese momento. Sigue
  // "enviando" hasta que el prompt se va o llega un error nuevo.
  const [answering, setAnswering] = useState<Map<string, { option: number; errorAtSend: unknown }>>(new Map());
  // promptId -> lo escrito en su opción libre.
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 space-y-2">
      {prompts.map((prompt) => {
        const error = errors.get(prompt.pane);
        const sent = answering.get(prompt.id);
        const sentOption = sent && sent.errorAtSend === error ? sent.option : undefined;
        const errorText = error?.promptId === prompt.id && sentOption === undefined ? error.error : null;
        const since = formatTime(prompt.desde);

        return (
          <Confirmation key={`${prompt.pane}:${prompt.id}`} approval="pending" data-testid="tmux-prompt">
            <ConfirmationTitle className="flex items-start gap-3">
              <TerminalSquareIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <ConfirmationRequest>
                <div className="text-xs text-muted-foreground">
                  {t('tmuxPrompt.title')}
                  {' · '}
                  <code className="rounded bg-muted px-1 py-0.5">{t('tmuxPrompt.pane', { pane: prompt.pane })}</code>
                  {since && ` · ${t('tmuxPrompt.waitingSince', { time: since })}`}
                </div>
                <div className="mt-1 font-medium text-foreground">{prompt.pregunta}</div>
              </ConfirmationRequest>
            </ConfirmationTitle>

            {prompt.detalle && (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
                {prompt.detalle}
              </pre>
            )}

            {errorText && (
              <div role="status" className="text-xs text-destructive">{errorText}</div>
            )}

            <ConfirmationActions className="flex-wrap">
              {prompt.opciones.map((option) => {
                const answer = () => {
                  setAnswering((previous) => new Map(previous).set(prompt.id, { option: option.indice, errorAtSend: error }));
                  if (option.libre) onAnswer(prompt, option.indice, (drafts.get(prompt.id) ?? '').trim());
                  else onAnswer(prompt, option.indice);
                };

                if (option.libre) {
                  const draft = drafts.get(prompt.id) ?? '';
                  return (
                    <form
                      key={option.indice}
                      className="flex min-w-[14rem] flex-1 items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (draft.trim() && sentOption === undefined) answer();
                      }}
                    >
                      <input
                        value={draft}
                        onChange={(event) => {
                          const { value } = event.target;
                          setDrafts((previous) => new Map(previous).set(prompt.id, value));
                        }}
                        disabled={sentOption !== undefined}
                        placeholder={t('tmuxPrompt.freeTextPlaceholder')}
                        aria-label={t('tmuxPrompt.freeTextPlaceholder')}
                        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                      />
                      <ConfirmationAction type="submit" variant="outline" disabled={!draft.trim() || sentOption !== undefined}>
                        {sentOption === option.indice ? t('tmuxPrompt.sending') : t('tmuxPrompt.freeTextSend')}
                      </ConfirmationAction>
                    </form>
                  );
                }

                const [firstLine] = option.etiqueta.split('\n');
                const label = option.numero !== null ? `${option.numero}. ${firstLine}` : firstLine;
                return (
                  <ConfirmationAction
                    key={option.indice}
                    variant={option.indice === 0 ? 'default' : 'outline'}
                    title={option.etiqueta}
                    disabled={sentOption !== undefined}
                    onClick={answer}
                  >
                    {sentOption === option.indice ? t('tmuxPrompt.sending') : label}
                  </ConfirmationAction>
                );
              })}
            </ConfirmationActions>
          </Confirmation>
        );
      })}
    </div>
  );
}
