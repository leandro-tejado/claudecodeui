# Evidencia E2E — f11-aislados-cuota-sin-turnos

Fecha: 2026-10-07T13:16:10.314Z · Escenarios: 1 · Gobernador: verde (pace 78%)

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 4 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `cuota/sin-turnos` | la ventana de 5 h muestra el % con su antigüedad ("hace N min"), no "sin dato" | ✅ pasa | [vieja-20min.png](cuota-sin-turnos/vieja-20min.png) | {"ok":true,"ms":8,"ultima":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 06:16 PM · Semanal: 21% hace 20 min, se renueva a las 03:16 PM"} |
| `cuota/sin-turnos` | la antigüedad reportada ronda los 20 min | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 06:16 PM · Semanal: 21% hace 20 min, se renueva a las 03:16 PM"} |
| `cuota/sin-turnos` | la semanal también muestra % con antigüedad, no "sin dato" | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 06:16 PM · Semanal: 21% hace 20 min, se renueva a las 03:16 PM"} |
| `cuota/sin-turnos` | no aparece "sin dato" en ningún lado habiendo una lectura (vieja) en el archivo | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Cuenta Optimum · Ventana de 5 horas: 37% hace 20 min, se renueva a las 06:16 PM · Semanal: 21% hace 20 min, se renueva a las 03:16 PM"} |
