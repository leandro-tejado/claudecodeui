# Fase 5 — streaming de tmux

**Fecha:** 9-oct-2026 · **Estado:** incompleto: falta verificar `:3001`

## Veredicto de la Fase 1, sin cambios: en vivo en `:3901`

`tmux/en-vivo` en `:3901` (instancia e2e con CLI real):

- el indicador «pensando» apareció a 1178 ms;
- el texto creció en **10 muestras distintas** (27 → 1001 caracteres);
- al final quedó **una sola fila**.

Por la rama «estaba en vivo» del goal, no se tocó código. No hay arreglo que probar, así que tampoco hay test rojo→verde.

## Lo que falta

- **`tmux/en-vivo` en `:3001`.** El servicio sirve `dist/` tal como está en disco. La sospecha principal sobre lo que vio Leandro («a saltos») es un bundle viejo en `:3001` o cacheado en el navegador. Para descartarla: Leandro corre `npm run build && systemctl --user restart cloudcli` desde ttyd, hace hard refresh y después se corre `node e2e/correr.mjs tmux/en-vivo` contra `:3001`. No se corrió: no se toca producción sin él.
- **La causa de la percepción** no está confirmada mientras no exista esa corrida.

## CPU (`pidstat -p <pid de cloudcli> 1 60`, 22:21 GT)

El proceso entero de `:3001` (pid 10385, con 6 sesiones de tmux vivas) promedió **11,4 %**: 6,0 usr + 5,4 sys.

Este número es del servidor completo, no del lector del pane. pidstat por pid no lo separa, así que el check «lector ≤ 5 %» **no se puede dar por cumplido con este número**. Para medir solo el lector hay que perfilar con `--cpu-prof` en `:3901` con 5 sesiones abiertas.
