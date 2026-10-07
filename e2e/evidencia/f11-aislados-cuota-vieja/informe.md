# Evidencia E2E — f11-aislados-cuota-vieja

Fecha: 2026-10-07T13:16:13.748Z · Escenarios: 1 · Gobernador: verde (pace 78%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 5 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `cuota/vieja` | la ventana de 5 h muestra "ventana nueva" en vez de un % inventado | ✅ pasa | [reseteada.png](cuota-vieja/reseteada.png) | {"ok":true,"ms":7,"ultima":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 03:11 PM) · Semanal: 30% real, se renueva a las 03:16 PM"} |
| `cuota/vieja` | no muestra el 97% de la ventana ya cerrada | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 03:11 PM) · Semanal: 30% real, se renueva a las 03:16 PM"} |
| `cuota/vieja` | trae la hora en que se renovó | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 03:11 PM) · Semanal: 30% real, se renueva a las 03:16 PM"} |
| `cuota/vieja` | la semanal, que no pasó su reset, sigue mostrando su % real | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 03:11 PM) · Semanal: 30% real, se renueva a las 03:16 PM"} |
| `cuota/vieja` | no aparece "sin dato" en ningún lado (hay lectura para las dos ventanas) | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: ventana nueva (se renovó a las 03:11 PM) · Semanal: 30% real, se renueva a las 03:16 PM"} |
