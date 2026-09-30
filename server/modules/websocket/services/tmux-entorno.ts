/**
 * Las variables con que una sesión de Claude Code marca a sus procesos hijos.
 *
 * Un servidor de tmux guarda como entorno global el del proceso que lo
 * arrancó, y cada sesión nueva lo hereda. El 30-sep el servidor de esta
 * máquina lo había levantado un `claude` corriendo por el SDK (el
 * orquestador), así que todos los `claude` de tmux nacían creyéndose un hijo
 * de SDK (`CLAUDE_CODE_ENTRYPOINT=sdk-ts`, `CLAUDE_CODE_CHILD_SESSION=1`) que
 * nadie atiende (`CLAUDE_CODE_SESSION_ATTENDED=0`), con el id de sesión y el
 * socket de mensajería de otro. Un pane de tmux es una REPL interactiva de la
 * persona: arranca sin nada de eso. El token no está en la lista a propósito.
 */
export const VARIABLES_DE_LA_SESION_PADRE = [
  'CLAUDECODE',
  'CLAUDE_AGENT_SDK_VERSION',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_EFFORT',
  'CLAUDE_PID',
] as const;

/** `env -u … <argv>`: corre el comando sin las variables de la sesión padre. */
export function sinEntornoDeLaSesionPadre(argv: string[]): string[] {
  return ['env', ...VARIABLES_DE_LA_SESION_PADRE.flatMap((variable) => ['-u', variable]), ...argv];
}
