import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, SquareCheckIcon, SquareIcon, TerminalSquareIcon } from 'lucide-react';

import type { TmuxPrompt, TmuxPromptKey, TmuxPromptTab } from '@/modules/skin';
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
  /** Una tecla suelta del pie del diálogo (flechas, Enter, Esc). */
  onKey?: (prompt: TmuxPrompt, key: TmuxPromptKey) => void;
};

const KEY_SYMBOL: Record<TmuxPromptKey, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
};

// Si la pantalla del pane no cambia (la tecla no hizo nada), la tarjeta no se
// queda trabada en "Enviando…": a los 4 s vuelve a estar disponible.
const SENDING_TIMEOUT_MS = 4000;

const TAB_STATE_KEY: Record<TmuxPromptTab['estado'], string> = {
  respondida: 'tmuxPrompt.tabAnswered',
  pendiente: 'tmuxPrompt.tabPending',
  enviar: 'tmuxPrompt.tabSubmit',
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
 *
 * Un diálogo que no es una lista de opciones —el formulario de auto mode del
 * 5-oct— se muestra tal cual se ve en el pane, con un botón por cada tecla
 * que nombra su pie. Cada tecla cambia la pantalla, y la tarjeta se
 * reemplaza con la nueva.
 *
 * Un AskUserQuestion de selección múltiple (5-oct, cloudcli-limpieza-guia-1:
 * los botones solo tildaban y destildaban, y no había cómo seguir) se ve con
 * sus pestañas, la activa marcada, y las opciones como casillas tildadas
 * según el pane. Para pasar de pregunta: "Siguiente" (el renglón "Next" del
 * pane, o →) y en la última "Enviar", que abre la revisión; "Anterior" es ←.
 * Lo que muestra sale siempre de releer el pane, nunca de lo que se tocó.
 */
export default function TmuxPromptBanner({ prompts, errors, onAnswer, onKey }: TmuxPromptBannerProps) {
  const { t } = useTranslation('chat');
  // promptId -> la opción mandada y el error que había en ese momento. Sigue
  // "enviando" hasta que el prompt se va o llega un error nuevo.
  // Una opción va por su índice; una tecla, por su nombre.
  const [answering, setAnswering] = useState<
    Map<string, { option: number | TmuxPromptKey; errorAtSend: unknown; token: number }>
  >(new Map());
  // promptId -> lo escrito en su opción libre.
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const sendSeq = useRef(0);

  if (prompts.length === 0) {
    return null;
  }

  const markSending = (promptId: string, option: number | TmuxPromptKey, errorAtSend: unknown) => {
    sendSeq.current += 1;
    const token = sendSeq.current;
    setAnswering((previous) => new Map(previous).set(promptId, { option, errorAtSend, token }));
    setTimeout(() => {
      setAnswering((previous) => {
        if (previous.get(promptId)?.token !== token) return previous;
        const next = new Map(previous);
        next.delete(promptId);
        return next;
      });
    }, SENDING_TIMEOUT_MS);
  };

  return (
    <div className="mb-3 space-y-2">
      {prompts.map((prompt) => {
        const error = errors.get(prompt.pane);
        const sent = answering.get(prompt.id);
        const sentOption = sent && sent.errorAtSend === error ? sent.option : undefined;
        const errorText = error?.promptId === prompt.id && sentOption === undefined ? error.error : null;
        const since = formatTime(prompt.desde);
        const tabs = prompt.pestanas ?? [];
        const multiple = prompt.multiple ?? prompt.opciones.some((option) => option.casilla);
        // Un AskUserQuestion: tiene pestañas (una sola si es una pregunta).
        const isAsk = tabs.length > 0;
        const advance = prompt.opciones.find((option) => option.avance);
        // Con pestañas, ←/→ van como "Anterior"/"Siguiente" y no en la fila de teclas.
        const navigates = tabs.length > 1;
        const previousKey = navigates ? prompt.teclas?.find((key) => key.tecla === 'Left') : undefined;
        const nextKey = navigates ? prompt.teclas?.find((key) => key.tecla === 'Right') : undefined;
        const otherKeys = (prompt.teclas ?? []).filter(
          (key) => !navigates || (key.tecla !== 'Left' && key.tecla !== 'Right'),
        );

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

            {tabs.length > 1 && (
              <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label={t('tmuxPrompt.tabs')} data-testid="tmux-prompt-tabs">
                {tabs.map((tab, index) => {
                  const TabIcon = tab.estado === 'respondida' ? SquareCheckIcon : tab.estado === 'enviar' ? CheckIcon : SquareIcon;
                  const label = tab.estado === 'enviar' ? t('tmuxPrompt.tabSubmit') : tab.etiqueta;
                  return (
                    <li
                      key={`${index}:${tab.etiqueta}`}
                      aria-current={tab.activa ? 'step' : undefined}
                      title={`${label} · ${t(TAB_STATE_KEY[tab.estado])}`}
                      className={`flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                        tab.activa
                          ? 'border-primary bg-primary/10 font-medium text-foreground'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <TabIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {label}
                    </li>
                  );
                })}
              </ol>
            )}

            {prompt.detalle && (
              <pre
                className={`max-h-48 overflow-auto rounded-md border bg-muted/50 p-2 text-xs ${
                  prompt.opciones.length === 0 ? 'whitespace-pre text-foreground' : 'whitespace-pre-wrap text-muted-foreground'
                }`}
              >
                {prompt.detalle}
              </pre>
            )}

            {isAsk && (
              <div className="text-xs text-muted-foreground">{t(multiple ? 'tmuxPrompt.multiHint' : 'tmuxPrompt.singleHint')}</div>
            )}

            {errorText && (
              <div role="status" className="text-xs text-destructive">{errorText}</div>
            )}

            <ConfirmationActions className={multiple ? 'flex-col items-stretch' : 'flex-wrap'}>
              {prompt.opciones.map((option) => {
                if (option.avance) return null;
                const answer = () => {
                  markSending(prompt.id, option.indice, error);
                  if (option.libre) onAnswer(prompt, option.indice, (drafts.get(prompt.id) ?? '').trim());
                  else onAnswer(prompt, option.indice);
                };

                if (option.libre) {
                  const draft = drafts.get(prompt.id) ?? '';
                  const filled = option.casilla && option.marcada ? option.etiqueta : null;
                  return (
                    <form
                      key={option.indice}
                      className="flex min-w-[14rem] flex-1 flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (draft.trim() && sentOption === undefined) answer();
                      }}
                    >
                      {option.casilla && (
                        <span className="flex items-center" aria-hidden="true">
                          {option.marcada ? <SquareCheckIcon className="h-4 w-4 text-primary" /> : <SquareIcon className="h-4 w-4 text-muted-foreground" />}
                        </span>
                      )}
                      <input
                        value={draft}
                        onChange={(event) => {
                          const { value } = event.target;
                          setDrafts((previous) => new Map(previous).set(prompt.id, value));
                        }}
                        disabled={sentOption !== undefined}
                        placeholder={filled ?? t('tmuxPrompt.freeTextPlaceholder')}
                        aria-label={t('tmuxPrompt.freeTextPlaceholder')}
                        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
                      />
                      <ConfirmationAction type="submit" variant="outline" disabled={!draft.trim() || sentOption !== undefined}>
                        {sentOption === option.indice ? t('tmuxPrompt.sending') : t('tmuxPrompt.freeTextSend')}
                      </ConfirmationAction>
                      {filled && (
                        <div className="w-full text-xs text-muted-foreground">{t('tmuxPrompt.freeTextFilled', { text: filled })}</div>
                      )}
                    </form>
                  );
                }

                const [firstLine] = option.etiqueta.split('\n');
                const label = option.numero !== null ? `${option.numero}. ${firstLine}` : firstLine;

                if (option.casilla) {
                  const CheckboxIcon = option.marcada ? SquareCheckIcon : SquareIcon;
                  return (
                    <ConfirmationAction
                      key={option.indice}
                      role="checkbox"
                      aria-checked={option.marcada === true}
                      aria-label={label}
                      variant="outline"
                      className="h-auto min-h-8 justify-start gap-2 px-3 py-1.5 text-left text-sm"
                      title={option.etiqueta}
                      disabled={sentOption !== undefined}
                      onClick={answer}
                    >
                      <CheckboxIcon
                        className={`h-4 w-4 shrink-0 ${option.marcada ? 'text-primary' : 'text-muted-foreground'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{sentOption === option.indice ? t('tmuxPrompt.sending') : label}</span>
                    </ConfirmationAction>
                  );
                }

                return (
                  <ConfirmationAction
                    key={option.indice}
                    variant={option.indice === 0 && !multiple ? 'default' : 'outline'}
                    title={option.etiqueta}
                    disabled={sentOption !== undefined}
                    onClick={answer}
                  >
                    {sentOption === option.indice ? t('tmuxPrompt.sending') : label}
                  </ConfirmationAction>
                );
              })}
            </ConfirmationActions>

            {(previousKey || advance || nextKey) && (
              <ConfirmationActions className="flex-wrap" data-testid="tmux-prompt-nav">
                {previousKey && onKey && (
                  <ConfirmationAction
                    variant="outline"
                    disabled={sentOption !== undefined}
                    onClick={() => {
                      markSending(prompt.id, 'Left', error);
                      onKey(prompt, 'Left');
                    }}
                  >
                    {sentOption === 'Left' ? t('tmuxPrompt.sending') : t('tmuxPrompt.previous')}
                  </ConfirmationAction>
                )}
                {advance ? (
                  <ConfirmationAction
                    disabled={sentOption !== undefined}
                    onClick={() => {
                      markSending(prompt.id, advance.indice, error);
                      onAnswer(prompt, advance.indice);
                    }}
                  >
                    {sentOption === advance.indice
                      ? t('tmuxPrompt.sending')
                      : t(/^submit$/i.test(advance.etiqueta) ? 'tmuxPrompt.submit' : 'tmuxPrompt.next')}
                  </ConfirmationAction>
                ) : nextKey && onKey && (
                  <ConfirmationAction
                    disabled={sentOption !== undefined}
                    onClick={() => {
                      markSending(prompt.id, 'Right', error);
                      onKey(prompt, 'Right');
                    }}
                  >
                    {sentOption === 'Right'
                      ? t('tmuxPrompt.sending')
                      : t(nextKey.accion === 'review' ? 'tmuxPrompt.review' : 'tmuxPrompt.next')}
                  </ConfirmationAction>
                )}
              </ConfirmationActions>
            )}

            {onKey && otherKeys.length > 0 && (
              <ConfirmationActions className="flex-wrap" data-testid="tmux-prompt-keys">
                {otherKeys.map(({ tecla, accion }) => {
                  const symbol = KEY_SYMBOL[tecla];
                  const label = accion ? `${symbol} · ${accion}` : symbol;
                  return (
                    <ConfirmationAction
                      key={tecla}
                      variant="outline"
                      aria-label={accion ? label : t(`tmuxPrompt.key.${tecla}`)}
                      title={accion ? label : t(`tmuxPrompt.key.${tecla}`)}
                      disabled={sentOption !== undefined}
                      onClick={() => {
                        markSending(prompt.id, tecla, error);
                        onKey(prompt, tecla);
                      }}
                    >
                      {sentOption === tecla ? t('tmuxPrompt.sending') : label}
                    </ConfirmationAction>
                  );
                })}
              </ConfirmationActions>
            )}
          </Confirmation>
        );
      })}
    </div>
  );
}
