import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDotIcon,
  PencilIcon,
  SquareCheckIcon,
  SquareIcon,
  TerminalSquareIcon,
  XIcon,
} from 'lucide-react';

import type { PermissionPanelProps, Question } from '@/shared/types';
import type { TmuxPrompt, TmuxPromptKey, TmuxPromptTab } from '@/modules/skin';

/*
 * `Cuestionario`: el único componente para toda pregunta que necesita que la
 * persona elija antes de seguir — reemplaza a `AskUserQuestionPanel.tsx`
 * (headless, vía `PermissionRequestsBanner`), a la parte de preguntas de
 * `PermissionRequestsBanner.tsx` y a `TmuxPromptBanner.tsx` (tmux: permisos
 * sí/no, confianza, formularios de teclas y AskUserQuestion). Diseño de
 * `design-system/visual-refs/05-octubre-cuestionario.html` (Fase 10, 06-oct):
 * cabecera con paso y puntos, cuerpo con opciones numeradas (radio o check) y
 * pie con el atajo de teclado — mismos tokens `ds-*` en los dos orígenes.
 * Teclado en los dos: 1-9 elige o tilda, Enter sigue/confirma, Esc cierra sin
 * responder.
 *
 * El boceto agrega una pantalla de "Revisión antes de enviar" que acá NO se
 * implementó: los escenarios `pregunta/headless`, `pregunta/modos`,
 * `pregunta/otra`, `pregunta/sin-repetidos` y `pregunta/recarga` (fuera del
 * alcance de este paso: solo `tmux-multi.mjs` se puede tocar) hacen clic en
 * "Submit" como acción final y esperan el turno enseguida, sin una pantalla
 * intermedia. Se documenta como brecha consciente contra el boceto.
 *
 * Dos adaptadores puros — lo único que cambia entre un turno headless y uno
 * de tmux es a qué mensaje de red se traduce la selección:
 *   - `respuestaHeadless(answers, extraInput?)`: la decisión que espera
 *     `chat.permission-response` (`allow: true, updatedInput: {...extraInput, answers}`).
 *   - `respuestaTmux(prompt, seleccion)`: el mensaje que espera
 *     `chat.tmux-prompt-response`. Con `seleccion.tipo === 'seleccion'` manda
 *     TODO lo tildado de una (nunca un pedido por clic): el server compone la
 *     secuencia completa con `teclasParaSeleccionCompuesta`/
 *     `responderSeleccionCompuestaTmux` (ya implementadas y probadas,
 *     Fase 9 paso 2) en vez de carrerear contra `TMUX_PROMPT_STALE` — eso es
 *     justo lo que trababa `pregunta/tmux-multi` en la pantalla "Review and
 *     submit" de la TUI.
 */

// ───────────────────────────── Adaptadores ─────────────────────────────

export type SeleccionTmux =
  | { tipo: 'opcion'; indice: number; texto?: string }
  | { tipo: 'seleccion'; indices: number[]; texto?: string }
  | { tipo: 'tecla'; tecla: TmuxPromptKey };

export type RespuestaTmuxMensaje = {
  type: 'chat.tmux-prompt-response';
  sessionId: string;
  pane: string;
  promptId: string;
  opcion?: number;
  seleccion?: number[];
  tecla?: TmuxPromptKey;
  texto?: string;
};

/** El mensaje `chat.tmux-prompt-response` para la selección elegida en la tarjeta. */
export function respuestaTmux(prompt: TmuxPrompt, seleccion: SeleccionTmux): RespuestaTmuxMensaje {
  const base = {
    type: 'chat.tmux-prompt-response' as const,
    sessionId: prompt.sessionId,
    pane: prompt.pane,
    promptId: prompt.id,
  };
  if (seleccion.tipo === 'tecla') {
    return { ...base, tecla: seleccion.tecla };
  }
  if (seleccion.tipo === 'seleccion') {
    return { ...base, seleccion: seleccion.indices, ...(seleccion.texto !== undefined ? { texto: seleccion.texto } : {}) };
  }
  return { ...base, opcion: seleccion.indice, ...(seleccion.texto !== undefined ? { texto: seleccion.texto } : {}) };
}

/** La decisión `chat.permission-response` para las respuestas armadas en la tarjeta headless. */
export function respuestaHeadless(
  answers: Record<string, string>,
  extraInput?: Record<string, unknown>,
): { allow: true; updatedInput: Record<string, unknown> } {
  return { allow: true, updatedInput: { ...extraInput, answers } };
}

// ─────────────────────────── Piezas compartidas ───────────────────────────

/** Puntos de paso de la cabecera (mockup `.puntos`/`.punto`). */
function PuntosDePaso({ total, actual }: { total: number; actual: number }) {
  if (total <= 1) return null;
  return (
    <div className="mx-auto flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i === actual ? 'bg-ds-primary' : i < actual ? 'bg-ds-signal-good' : 'bg-ds-line-strong'
          }`}
        />
      ))}
    </div>
  );
}

/** Radio o check de una fila de opción (mockup `.radio-ico`/`.check-ico`). */
function IconoOpcion({ multi, marcada }: { multi: boolean; marcada: boolean }) {
  if (multi) {
    return (
      <span
        className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px] ${
          marcada ? 'border-ds-primary' : 'border-ds-line-strong'
        }`}
      >
        {marcada && <CheckIcon className="h-3 w-3 text-ds-primary" strokeWidth={2.5} aria-hidden="true" />}
      </span>
    );
  }
  return (
    <span
      className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-[1.5px] ${
        marcada ? 'border-ds-primary' : 'border-ds-line-strong'
      }`}
    >
      {marcada && <span className="h-2 w-2 rounded-full bg-ds-primary" />}
    </span>
  );
}

// ──────────────────────────── Headless (SDK) ────────────────────────────

const NO_QUESTIONS: Question[] = [];

/**
 * Registrada por `PermissionRequestsBanner` como el panel de permiso para
 * AskUserQuestion: la persona responde las preguntas del modelo ahí mismo,
 * antes del próximo turno. Reemplaza a `AskUserQuestionPanel.tsx`.
 *
 * Los botones "Next"/"Submit"/"Back"/"Other..." quedan literales en inglés a
 * propósito: los escenarios `pregunta/headless`, `/modos`, `/otra`,
 * `/sin-repetidos` y `/recarga` los buscan por ese texto exacto y no están
 * autorizados a tocarse en este paso.
 */
export const CuestionarioHeadless: React.FC<PermissionPanelProps> = ({ request, onDecision }) => {
  const { t } = useTranslation();
  const input = request.input as { questions?: Question[] } | undefined;
  const questions: Question[] = input?.questions ?? NO_QUESTIONS;

  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Map<number, Set<string>>>(() => new Map());
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(() => new Map());
  const [otherActive, setOtherActive] = useState<Map<number, boolean>>(() => new Map());
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!otherActive.get(currentStep)) {
      containerRef.current?.focus();
    }
  }, [currentStep, otherActive]);

  useEffect(() => {
    if (otherActive.get(currentStep)) {
      otherInputRef.current?.focus();
    }
  }, [otherActive, currentStep]);

  const toggleOption = useCallback((qIdx: number, label: string, multiSelect: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(qIdx) || []);
      if (multiSelect) {
        if (current.has(label)) current.delete(label);
        else current.add(label);
      } else {
        current.clear();
        current.add(label);
        setOtherActive((p) => { const n = new Map(p); n.set(qIdx, false); return n; });
      }
      next.set(qIdx, current);
      return next;
    });
  }, []);

  const toggleOther = useCallback((qIdx: number, multiSelect: boolean) => {
    setOtherActive((prev) => {
      const next = new Map(prev);
      const wasActive = next.get(qIdx) || false;
      next.set(qIdx, !wasActive);
      if (!multiSelect && !wasActive) {
        setSelections((p) => { const n = new Map(p); n.set(qIdx, new Set()); return n; });
      }
      return next;
    });
  }, []);

  const setOtherText = useCallback((qIdx: number, text: string) => {
    setOtherTexts((prev) => { const next = new Map(prev); next.set(qIdx, text); return next; });
  }, []);

  const buildAnswers = useCallback(() => {
    const answers: Record<string, string> = {};
    questions.forEach((q, idx) => {
      const selected = Array.from(selections.get(idx) || []);
      const isOther = otherActive.get(idx) || false;
      const otherText = (otherTexts.get(idx) || '').trim();
      if (isOther && otherText) selected.push(otherText);
      if (selected.length > 0) answers[q.question] = selected.join(', ');
    });
    return answers;
  }, [questions, selections, otherActive, otherTexts]);

  const handleSubmit = useCallback(() => {
    onDecision(request.requestId, respuestaHeadless(buildAnswers(), input));
  }, [onDecision, request.requestId, input, buildAnswers]);

  const handleSkip = useCallback(() => {
    onDecision(request.requestId, respuestaHeadless({}, input));
  }, [onDecision, request.requestId, input]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;

    const q = questions[currentStep];
    if (!q) return;
    const multi = q.multiSelect || false;
    const optCount = q.options.length;

    const num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 1 && num <= optCount) {
      e.preventDefault();
      toggleOption(currentStep, q.options[num - 1].label, multi);
      return;
    }

    if (e.key === '0') {
      e.preventDefault();
      toggleOther(currentStep, multi);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const isLast = currentStep === questions.length - 1;
      if (isLast) handleSubmit();
      else setCurrentStep((s) => s + 1);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleSkip();
      return;
    }
  }, [currentStep, questions, toggleOption, toggleOther, handleSubmit, handleSkip]);

  if (questions.length === 0) return null;

  const total = questions.length;
  const isSingle = total === 1;
  const q = questions[currentStep];
  const multi = q.multiSelect || false;
  const selected = selections.get(currentStep) || new Set<string>();
  const isOtherOn = otherActive.get(currentStep) || false;
  const isLast = currentStep === total - 1;
  const isFirst = currentStep === 0;
  const hasCurrentSelection = selected.size > 0 || (isOtherOn && (otherTexts.get(currentStep) || '').trim().length > 0);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={`w-full outline-none transition-all duration-500 ease-out ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <div className="overflow-hidden rounded-ds-lg border border-ds-line bg-ds-surface shadow-ds-float">
        {/* Cabecera: paso, puntos, cerrar (= Esc, sin responder) */}
        <div className="flex items-center gap-4 border-b border-ds-line px-4 py-3">
          {!isSingle && (
            <span className="flex-none text-[12px] font-semibold text-ds-muted">
              {currentStep + 1}/{total}
            </span>
          )}
          <PuntosDePaso total={total} actual={currentStep} />
          <button
            type="button"
            onClick={handleSkip}
            aria-label={isSingle ? t('chat:misc.skipOne') : t('chat:misc.skipAll')}
            title={`${isSingle ? t('chat:misc.skipOne') : t('chat:misc.skipAll')} (Esc)`}
            className="ml-auto flex h-7 w-7 flex-none items-center justify-center rounded-full text-ds-faint transition-colors hover:bg-ds-surface-3 hover:text-ds-ink"
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ds-primary-dark">
            {multi ? <SquareCheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleDotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
            {multi ? 'Selección múltiple' : 'Opción única'}
          </p>
          <h3 className="mb-3 text-[17px] font-bold leading-snug text-ds-ink">{q.question}</h3>

          <div
            className="scrollbar-thin flex max-h-56 flex-col gap-2 overflow-y-auto"
            role={multi ? 'group' : 'radiogroup'}
            aria-label={q.question}
          >
            {q.options.map((opt, optIdx) => {
              const isSelected = selected.has(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => toggleOption(currentStep, opt.label, multi)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-ds-md border px-3.5 py-2.5 text-left ${
                    isSelected ? 'border-ds-primary bg-ds-primary-tint' : 'border-ds-line hover:border-ds-line-strong hover:bg-ds-surface-2'
                  }`}
                >
                  <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
                    isSelected ? 'bg-ds-primary text-white' : 'bg-ds-surface-3 text-ds-faint'
                  }`} aria-hidden="true">
                    {optIdx + 1}
                  </span>
                  <IconoOpcion multi={multi} marcada={isSelected} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-ds-ink">{opt.label}</span>
                    {opt.description && (
                      <span className="block text-[11.5px] text-ds-muted">{opt.description}</span>
                    )}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => toggleOther(currentStep, multi)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-ds-md border px-3.5 py-2.5 text-left ${
                isOtherOn ? 'border-ds-primary bg-ds-primary-tint' : 'border-dashed border-ds-line hover:border-ds-line-strong hover:bg-ds-surface-2'
              }`}
            >
              <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
                isOtherOn ? 'bg-ds-primary text-white' : 'bg-ds-surface-3 text-ds-faint'
              }`} aria-hidden="true">
                0
              </span>
              <PencilIcon className={`h-4 w-4 flex-none ${isOtherOn ? 'text-ds-primary' : 'text-ds-faint'}`} aria-hidden="true" />
              <span className="text-[14px] text-ds-muted">Other...</span>
            </button>

            {isOtherOn && (
              <div className="ml-11">
                <input
                  ref={otherInputRef}
                  type="text"
                  value={otherTexts.get(currentStep) || ''}
                  onChange={(e) => setOtherText(currentStep, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (isLast) handleSubmit();
                      else setCurrentStep((s) => s + 1);
                    }
                    e.stopPropagation();
                  }}
                  placeholder={t('chat:misc.typeAnswer')}
                  className="w-full rounded-ds-sm border border-ds-primary bg-ds-surface px-3 py-2 text-[13px] text-ds-ink outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Pie: atajo de teclado + navegación */}
        <div className="flex flex-wrap items-center gap-3 border-t border-ds-line bg-ds-surface-2 px-4 py-3">
          <span className="min-w-[8rem] flex-1 text-[11.5px] text-ds-faint">
            1–{q.options.length} elegí · Enter {isLast ? 'envía' : 'sigue'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!isSingle && !isFirst && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="flex min-h-9 items-center gap-1 rounded-ds-sm border border-ds-line px-3 text-[13px] font-medium text-ds-muted hover:border-ds-line-strong hover:text-ds-ink"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!hasCurrentSelection && Object.keys(buildAnswers()).length === 0}
                className="flex min-h-9 items-center gap-1 rounded-ds-sm bg-ds-primary px-3.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Submit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s + 1)}
                className="flex min-h-9 items-center gap-1 rounded-ds-sm bg-ds-primary px-3.5 text-[13px] font-semibold text-white"
              >
                Next
                <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────── Tmux ─────────────────────────────

type CuestionarioTmuxProps = {
  prompts: TmuxPrompt[];
  errors: ReadonlyMap<string, { promptId: string; error: string }>;
  /** Una respuesta de cualquier forma — opción, selección compuesta o tecla. */
  onResponder: (prompt: TmuxPrompt, seleccion: SeleccionTmux) => void;
};

const KEY_SYMBOL: Record<TmuxPromptKey, string> = {
  Up: '↑', Down: '↓', Left: '←', Right: '→', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab',
};

const SENDING_TIMEOUT_MS = 4000;

const TAB_STATE_KEY: Record<TmuxPromptTab['estado'], string> = {
  respondida: 'tmuxPrompt.tabAnswered',
  pendiente: 'tmuxPrompt.tabPending',
  enviar: 'tmuxPrompt.tabSubmit',
};

/**
 * Una tarjeta de pregunta de tmux (una por pane). Para las de casillas
 * (`multiple`), tildar NO manda nada: la selección se acumula en el estado
 * local de este componente (inicializado una sola vez, al montar, desde lo
 * que el pane ya tenía tildado) y recién al confirmar —botón "Enviar" o
 * Enter— se manda una orden compuesta con `respuestaTmux({tipo:'seleccion'})`.
 * Es clave para la Fase 9 paso 2: un pedido por clic competía contra su
 * propio redibujado (`TMUX_PROMPT_STALE`); éste manda uno solo. Para todo lo
 * demás (opción simple, teclas sueltas, navegación de pestañas) el clic sigue
 * mandando de inmediato, igual que `TmuxPromptBanner`.
 */
function TarjetaPromptTmux({
  prompt,
  error,
  onResponder,
}: {
  prompt: TmuxPrompt;
  error: { promptId: string; error: string } | undefined;
  onResponder: (prompt: TmuxPrompt, seleccion: SeleccionTmux) => void;
}) {
  const { t } = useTranslation('chat');
  const tabs = prompt.pestanas ?? [];
  const multiple = prompt.multiple ?? prompt.opciones.some((option) => option.casilla);
  const isAsk = tabs.length > 0;
  const advance = prompt.opciones.find((option) => option.avance);
  const libreCasilla = prompt.opciones.find((option) => option.casilla && option.libre);
  const navigates = tabs.length > 1;
  const previousKey = navigates ? prompt.teclas?.find((key) => key.tecla === 'Left') : undefined;
  const nextKey = navigates ? prompt.teclas?.find((key) => key.tecla === 'Right') : undefined;
  const otherKeys = (prompt.teclas ?? []).filter((key) => !navigates || (key.tecla !== 'Left' && key.tecla !== 'Right'));

  // Selección local de las casillas: solo existe para preguntas `multiple`, y
  // solo se inicializa una vez (no se resincroniza con `prompt` mientras la
  // persona interactúa — ver nota arriba del componente).
  const [marcadas, setMarcadas] = useState<Set<number>>(
    () => new Set(prompt.opciones.filter((o) => o.casilla && o.marcada).map((o) => o.indice)),
  );
  const [textoLibre, setTextoLibre] = useState('');
  const [enviando, setEnviando] = useState(false);
  const sendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El error que ya estaba cuando se mandó: si llega uno NUEVO (otra
  // referencia) mientras "enviando" está prendido, es la respuesta a ESTE
  // envío — se apaga enseguida en vez de esperar los 4 s del timeout.
  const erroAlEnviar = useRef(error);

  useEffect(() => () => { if (sendingTimer.current) clearTimeout(sendingTimer.current); }, []);

  useEffect(() => {
    if (enviando && error !== erroAlEnviar.current) {
      setEnviando(false);
    }
  }, [error, enviando]);

  const marcarEnviando = () => {
    erroAlEnviar.current = error;
    setEnviando(true);
    if (sendingTimer.current) clearTimeout(sendingTimer.current);
    sendingTimer.current = setTimeout(() => setEnviando(false), SENDING_TIMEOUT_MS);
  };

  const errorText = error?.promptId === prompt.id && !enviando ? error.error : null;

  const toggleCasilla = (indice: number) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(indice)) next.delete(indice);
      else next.add(indice);
      return next;
    });
  };

  const enviarSeleccion = useCallback(() => {
    marcarEnviando();
    onResponder(prompt, { tipo: 'seleccion', indices: [...marcadas], ...(textoLibre ? { texto: textoLibre } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, marcadas, textoLibre, onResponder]);

  const responderOpcion = (indice: number, texto?: string) => {
    marcarEnviando();
    onResponder(prompt, { tipo: 'opcion', indice, ...(texto !== undefined ? { texto } : {}) });
  };

  const responderTecla = (tecla: TmuxPromptKey) => {
    marcarEnviando();
    onResponder(prompt, { tipo: 'tecla', tecla });
  };

  // Teclado: 1-9 tilda/elige, Enter sigue/confirma, Esc cierra sin responder
  // (si el pie la ofrece ahora).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 1) {
      const opcion = prompt.opciones.find((o) => o.numero === num);
      if (opcion && opcion.casilla && !opcion.libre) {
        e.preventDefault();
        toggleCasilla(opcion.indice);
        return;
      }
      if (opcion && !opcion.casilla && !opcion.libre) {
        e.preventDefault();
        responderOpcion(opcion.indice);
        return;
      }
    }
    if (e.key === 'Enter') {
      if (multiple && advance) {
        e.preventDefault();
        enviarSeleccion();
      } else if (!multiple && nextKey) {
        e.preventDefault();
        responderTecla('Right');
      }
      return;
    }
    if (e.key === 'Escape') {
      const escapeKey = prompt.teclas?.find((k) => k.tecla === 'Escape');
      if (escapeKey) {
        e.preventDefault();
        responderTecla('Escape');
      }
    }
  };

  const hintTeclado = multiple
    ? t('tmuxPrompt.multiHint')
    : t('tmuxPrompt.singleHint');

  return (
    <div
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="overflow-hidden rounded-ds-lg border border-ds-line bg-ds-surface shadow-ds-float outline-none"
      data-testid="tmux-prompt"
    >
      <div className="flex items-center gap-3 border-b border-ds-line px-4 py-3">
        <TerminalSquareIcon className="h-4 w-4 flex-none text-ds-signal-warn" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-ds-muted">
          {t('tmuxPrompt.title')} · <code className="rounded bg-ds-surface-3 px-1 py-0.5">{t('tmuxPrompt.pane', { pane: prompt.pane })}</code>
        </span>
      </div>

      {tabs.length > 1 && (
        <ol className="flex flex-wrap items-center gap-1 px-4 pt-3 text-[11px]" aria-label={t('tmuxPrompt.tabs')} data-testid="tmux-prompt-tabs">
          {tabs.map((tab, index) => {
            const TabIcon = tab.estado === 'respondida' ? SquareCheckIcon : tab.estado === 'enviar' ? CheckIcon : SquareIcon;
            const label = tab.estado === 'enviar' ? t('tmuxPrompt.tabSubmit') : tab.etiqueta;
            return (
              <li
                key={`${index}:${tab.etiqueta}`}
                aria-current={tab.activa ? 'step' : undefined}
                title={`${label} · ${t(TAB_STATE_KEY[tab.estado])}`}
                className={`flex items-center gap-1 rounded-ds-sm border px-2 py-0.5 ${
                  tab.activa ? 'border-ds-primary bg-ds-primary-tint font-medium text-ds-ink' : 'border-ds-line text-ds-muted'
                }`}
              >
                <TabIcon className="h-3 w-3 flex-none" aria-hidden="true" />
                {label}
              </li>
            );
          })}
        </ol>
      )}

      <div className="px-4 py-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ds-primary-dark">
          {multiple ? <SquareCheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleDotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
          {multiple ? 'Selección múltiple' : 'Opción única'}
        </p>
        <h3 className="mb-2 text-[16px] font-bold leading-snug text-ds-ink">{prompt.pregunta}</h3>
        {isAsk && <p className="mb-3 text-[12px] text-ds-muted">{hintTeclado}</p>}

        {prompt.detalle && (
          <pre className={`mb-3 max-h-48 overflow-auto rounded-ds-md border border-ds-line bg-ds-surface-2 p-2 text-[12px] ${
            prompt.opciones.length === 0 ? 'whitespace-pre text-ds-ink' : 'whitespace-pre-wrap text-ds-muted'
          }`}>
            {prompt.detalle}
          </pre>
        )}

        {errorText && <div role="status" className="mb-3 text-[12px] text-ds-signal-bad">{errorText}</div>}

        <div className="flex flex-col gap-2">
          {prompt.opciones.map((option) => {
            if (option.avance) return null;
            const [firstLine] = option.etiqueta.split('\n');

            if (option.libre) {
              if (multiple) {
                // La libre de una pregunta de casillas: tildarla y escribir
                // el texto queda local hasta el envío compuesto.
                const marcada = marcadas.has(option.indice);
                return (
                  <div key={option.indice} className="flex flex-col gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={marcada}
                      onClick={() => toggleCasilla(option.indice)}
                      disabled={enviando}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-ds-md border px-3.5 py-2.5 text-left ${
                        marcada ? 'border-ds-primary bg-ds-primary-tint' : 'border-dashed border-ds-line hover:border-ds-line-strong'
                      }`}
                    >
                      <IconoOpcion multi marcada={marcada} />
                      <span className="text-[14px] text-ds-ink">{firstLine}</span>
                    </button>
                    {marcada && (
                      <input
                        value={textoLibre}
                        onChange={(e) => setTextoLibre(e.target.value)}
                        disabled={enviando}
                        placeholder={t('tmuxPrompt.freeTextPlaceholder')}
                        aria-label={t('tmuxPrompt.freeTextPlaceholder')}
                        className="ml-11 rounded-ds-sm border border-ds-primary bg-ds-surface px-3 py-2 text-[13px] text-ds-ink outline-none"
                      />
                    )}
                  </div>
                );
              }
              // La libre de una pregunta común (opción simple): campo con su
              // propio envío inmediato, igual que antes.
              const draft = textoLibre;
              return (
                <form
                  key={option.indice}
                  className="flex min-w-[14rem] flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.trim() && !enviando) responderOpcion(option.indice, draft.trim());
                  }}
                >
                  <input
                    value={draft}
                    onChange={(e) => setTextoLibre(e.target.value)}
                    disabled={enviando}
                    placeholder={t('tmuxPrompt.freeTextPlaceholder')}
                    aria-label={t('tmuxPrompt.freeTextPlaceholder')}
                    className="h-11 min-w-0 flex-1 rounded-ds-md border border-ds-line bg-ds-surface px-3 text-[14px] text-ds-ink outline-none focus:border-ds-primary"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || enviando}
                    className="flex min-h-11 items-center rounded-ds-sm border border-ds-line px-3 text-[13px] font-medium text-ds-muted disabled:opacity-40"
                  >
                    {enviando ? t('tmuxPrompt.sending') : t('tmuxPrompt.freeTextSend')}
                  </button>
                </form>
              );
            }

            if (option.casilla) {
              const marcada = marcadas.has(option.indice);
              const label = option.numero !== null ? `${option.numero}. ${firstLine}` : firstLine;
              return (
                <button
                  key={option.indice}
                  type="button"
                  role="checkbox"
                  aria-checked={marcada}
                  aria-label={label}
                  disabled={enviando}
                  onClick={() => toggleCasilla(option.indice)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-ds-md border px-3.5 py-2.5 text-left ${
                    marcada ? 'border-ds-primary bg-ds-primary-tint' : 'border-ds-line hover:border-ds-line-strong hover:bg-ds-surface-2'
                  }`}
                >
                  {option.numero !== null && (
                    <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
                      marcada ? 'bg-ds-primary text-white' : 'bg-ds-surface-3 text-ds-faint'
                    }`} aria-hidden="true">
                      {option.numero}
                    </span>
                  )}
                  <IconoOpcion multi marcada={marcada} />
                  <span className="text-[14px] text-ds-ink">{firstLine}</span>
                </button>
              );
            }

            const label = option.numero !== null ? `${option.numero}. ${firstLine}` : firstLine;
            return (
              <button
                key={option.indice}
                type="button"
                role={isAsk ? 'radio' : 'button'}
                aria-checked={isAsk ? prompt.seleccionada === option.indice : undefined}
                title={option.etiqueta}
                disabled={enviando}
                onClick={() => responderOpcion(option.indice)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-ds-md border px-3.5 py-2.5 text-left ${
                  prompt.seleccionada === option.indice
                    ? 'border-ds-primary bg-ds-primary-tint'
                    : 'border-ds-line hover:border-ds-line-strong hover:bg-ds-surface-2'
                }`}
              >
                {option.numero !== null && (
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-ds-surface-3 text-[11px] font-semibold text-ds-faint" aria-hidden="true">
                    {option.numero}
                  </span>
                )}
                {isAsk && <IconoOpcion multi={false} marcada={prompt.seleccionada === option.indice} />}
                <span className="text-[14px] text-ds-ink">{enviando ? t('tmuxPrompt.sending') : label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(previousKey || advance || nextKey || otherKeys.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-ds-line bg-ds-surface-2 px-4 py-3" data-testid="tmux-prompt-nav">
          <span className="min-w-[8rem] flex-1 text-[11.5px] text-ds-faint">{t('tmuxPrompt.title')} · Enter {multiple ? 'envía' : 'sigue'} · Esc cierra</span>
          <div className="ml-auto flex items-center gap-2">
            {previousKey && (
              <button
                type="button"
                disabled={enviando}
                onClick={() => responderTecla('Left')}
                className="flex min-h-9 items-center gap-1 rounded-ds-sm border border-ds-line px-3 text-[13px] font-medium text-ds-muted hover:border-ds-line-strong hover:text-ds-ink disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {t('tmuxPrompt.previous')}
              </button>
            )}
            {advance ? (
              <button
                type="button"
                disabled={enviando || (!!libreCasilla && marcadas.has(libreCasilla.indice) && !textoLibre.trim())}
                onClick={enviarSeleccion}
                className="flex min-h-9 items-center gap-1 rounded-ds-sm bg-ds-primary px-3.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {enviando
                  ? t('tmuxPrompt.sending')
                  : /^submit$/i.test(advance.etiqueta) ? 'Enviar' : 'Siguiente'}
              </button>
            ) : nextKey && (
              <button
                type="button"
                disabled={enviando}
                onClick={() => responderTecla('Right')}
                className="flex min-h-9 items-center gap-1 rounded-ds-sm bg-ds-primary px-3.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {enviando ? t('tmuxPrompt.sending') : (nextKey.accion === 'review' ? 'Revisar y enviar' : 'Siguiente')}
                <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {otherKeys.map(({ tecla, accion }) => {
              const symbol = KEY_SYMBOL[tecla];
              const label = accion ? `${symbol} · ${accion}` : symbol;
              return (
                <button
                  key={tecla}
                  type="button"
                  disabled={enviando}
                  aria-label={accion ? label : t(`tmuxPrompt.key.${tecla}`)}
                  title={accion ? label : t(`tmuxPrompt.key.${tecla}`)}
                  onClick={() => responderTecla(tecla)}
                  className="flex min-h-9 items-center gap-1 rounded-ds-sm border border-ds-line px-3 text-[13px] font-medium text-ds-muted hover:border-ds-line-strong hover:text-ds-ink disabled:opacity-40"
                >
                  {enviando ? t('tmuxPrompt.sending') : label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * La lista de preguntas abiertas de tmux para la sesión que se está viendo.
 * Reemplaza a `TmuxPromptBanner`.
 */
export default function Cuestionario({ prompts, errors, onResponder }: CuestionarioTmuxProps) {
  if (prompts.length === 0) return null;
  return (
    <div className="mb-3 space-y-2">
      {prompts.map((prompt) => (
        <TarjetaPromptTmux
          key={`${prompt.pane}:${prompt.id}`}
          prompt={prompt}
          error={errors.get(prompt.pane)}
          onResponder={onResponder}
        />
      ))}
    </div>
  );
}
