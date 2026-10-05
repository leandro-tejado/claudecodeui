# Evidencia E2E — 03-cuota

Actualizado: 2026-10-05T20:23:36.624Z · Gobernador: rojo

| Resultado | Cantidad |
|---|---|
| ✅ pasa | 18 |
| ❌ falla | 0 |
| ⏸ bloqueado | 0 |

| Escenario | Check | Resultado | Evidencia | Datos |
|---|---|---|---|---|
| `cuota/sin-turnos` | la ventana de 5 h muestra el % con su antigüedad ("hace N min"), no "sin dato" | ✅ pasa | [vieja-20min.png](cuota-sin-turnos/vieja-20min.png) | {"ok":true,"ms":7,"ultima":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 01:22 AM · Semanal: 21% hace 20 min, se renueva a las 10:22 PM"} |
| `cuota/sin-turnos` | la antigüedad reportada ronda los 20 min | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 01:22 AM · Semanal: 21% hace 20 min, se renueva a las 10:22 PM"} |
| `cuota/sin-turnos` | la semanal también muestra % con antigüedad, no "sin dato" | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 01:22 AM · Semanal: 21% hace 20 min, se renueva a las 10:22 PM"} |
| `cuota/sin-turnos` | no aparece "sin dato" en ningún lado habiendo una lectura (vieja) en el archivo | ✅ pasa | [frames-0.json](cuota-sin-turnos/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% hace 20 min, se renueva a las 01:22 AM · Semanal: 21% hace 20 min, se renueva a las 10:22 PM"} |
| `cuota/vieja` | la ventana de 5 h muestra "ventana nueva" en vez de un % inventado | ✅ pasa | [reseteada.png](cuota-vieja/reseteada.png) | {"ok":true,"ms":9,"ultima":"Ventana de 5 horas: ventana nueva (se renovó a las 10:18 PM) · Semanal: 30% real, se renueva a las 10:23 PM"} |
| `cuota/vieja` | no muestra el 97% de la ventana ya cerrada | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 10:18 PM) · Semanal: 30% real, se renueva a las 10:23 PM"} |
| `cuota/vieja` | trae la hora en que se renovó | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 10:18 PM) · Semanal: 30% real, se renueva a las 10:23 PM"} |
| `cuota/vieja` | la semanal, que no pasó su reset, sigue mostrando su % real | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 10:18 PM) · Semanal: 30% real, se renueva a las 10:23 PM"} |
| `cuota/vieja` | no aparece "sin dato" en ningún lado (hay lectura para las dos ventanas) | ✅ pasa | [frames-0.json](cuota-vieja/frames-0.json) | {"etiqueta":"Ventana de 5 horas: ventana nueva (se renovó a las 10:18 PM) · Semanal: 30% real, se renueva a las 10:23 PM"} |
| `cuota/header` | 5 h muestra la lectura fresca del archivo (≤ 15 s, sin reiniciar) | ✅ pasa | [primera-lectura.png](cuota-header/primera-lectura.png) | {"ok":true,"ms":10,"ultima":"Ventana de 5 horas: 37% real, se renueva a las 01:23 AM · Semanal: 21% real, se renueva a las 10:23 PM"} |
| `cuota/header` | la semanal muestra % (no solo la hora de renovación) | ✅ pasa | [frames-0.json](cuota-header/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 37% real, se renueva a las 01:23 AM · Semanal: 21% real, se renueva a las 10:23 PM"} |
| `cuota/header` | el header sigue el cambio sin recargar (≤ 15 s) | ✅ pasa | [segunda-lectura.png](cuota-header/segunda-lectura.png) | {"ok":true,"ms":1545,"ultima":"Ventana de 5 horas: 52% real, se renueva a las 01:23 AM · Semanal: 23% real, se renueva a las 10:23 PM"} |
| `cuota/header` | el detalle no dice "sin dato" en ninguna ventana | ✅ pasa | [detalle.png](cuota-header/detalle.png) |  |
| `cuota/header` | movil: el header muestra la cuota | ✅ pasa | [movil-header.png](cuota-header/movil-header.png) | {"ok":true,"ms":5,"ultima":"Ventana de 5 horas: 52% real, se renueva a las 01:23 AM · Semanal: 23% real, se renueva a las 10:23 PM"} |
| `cuota/en-vivo` | el header abre con la primera lectura del archivo | ✅ pasa | [primera-lectura.png](cuota-en-vivo/primera-lectura.png) | {"ok":true,"ms":12,"ultima":"Ventana de 5 horas: 41% real, se renueva a las 01:23 AM · Semanal: 22% real, se renueva a las 10:23 PM"} |
| `cuota/en-vivo` | el header sigue el cambio del archivo en ≤ 3 s, sin recargar | ✅ pasa | [segunda-lectura.png](cuota-en-vivo/segunda-lectura.png) | {"ok":true,"ms":1425,"ultima":"Ventana de 5 horas: 52% real, se renueva a las 01:23 AM · Semanal: 23% real, se renueva a las 10:23 PM","msReales":1425} |
| `cuota/en-vivo` | la semanal también se actualizó (23%) | ✅ pasa | [frames-0.json](cuota-en-vivo/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 52% real, se renueva a las 01:23 AM · Semanal: 23% real, se renueva a las 10:23 PM"} |
| `cuota/en-vivo` | el label no dice "sin dato" habiendo archivo | ✅ pasa | [frames-0.json](cuota-en-vivo/frames-0.json) | {"etiqueta":"Ventana de 5 horas: 52% real, se renueva a las 01:23 AM · Semanal: 23% real, se renueva a las 10:23 PM"} |
