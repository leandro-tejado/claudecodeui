/**
 * The one line every Claude run — SDK and tmux alike — gets appended to its
 * system prompt so the agent knows where a deliverable belongs.
 *
 * Kept as a single exported constant, not duplicated per provider, because
 * both call sites live in this same repo (unlike the servidor-code/
 * app-optimum-mkt pair, which are separate repos and therefore do carry two
 * copies). `claude-runtime.provider.js` appends it to `systemPrompt.append`
 * for the SDK path; `tmux-bridge.service.ts` passes it via
 * `--append-system-prompt` when it spawns a brand-new pane.
 */
export const SALIDAS_SYSTEM_PROMPT_APPEND =
  'Los entregables (informes, PDFs, imagenes, CSV) se guardan en .informes/ '
  + 'con nombre descriptivo; lo que quede ahi aparece en el panel Salidas.';
