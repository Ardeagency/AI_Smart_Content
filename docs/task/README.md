# Tareas y deuda técnica

Esta carpeta es el **tracker vivo** de la deuda técnica y los pendientes activos de la plataforma. Convivencia: cada archivo es una tarea; cuando se resuelve, **se elimina el archivo** (no se mueve a "done"). El git history es el archivo histórico.

## Convenciones

### Naming
```
{TYPE}-{NNN}-{slug}.md
```

| TYPE | Significado |
|---|---|
| `BUG`  | Algo está roto en producción o en el dispatcher de jobs |
| `DATA` | Datos inconsistentes, NULL, vacíos por configuración faltante |
| `FEAT` | Feature pendiente del plan maestro |
| `OPS`  | Mejora operacional, monitoring, infra |
| `DOCS` | Documentación faltante o desactualizada |
| `TEST` | Tests faltantes |

`NNN` = contador secuencial dentro del tipo (BUG-001, BUG-002, …).

### Frontmatter obligatorio

Cada archivo de tarea empieza con:

```yaml
---
id: BUG-001
title: Body missions colgadas (competitor_signal_analysis)
severity: critical | high | medium | low
type: bug | data | feature | ops | docs | test
status: open | in_progress | blocked
auto_eligible: yes | no
auto_eligible_reason: por qué (1 línea)
est_duration: short (<30min) | medium (30-90min) | long (90min-3h)
created: 2026-04-29
owner: -
blocked_by: [otros-ids]   # opcional
---
```

`auto_eligible` indica si el agente programado puede ejecutar la tarea autónomamente entre 23:00–03:00 Bogota.

### Estructura del cuerpo

```markdown
## Síntoma
Qué se observa, dónde, desde cuándo.

## Evidencia
Queries SQL, líneas de log, paths de archivo, fechas.

## Hipótesis
Causa raíz probable.

## Pasos para resolver
1. ...
2. ...

## Criterio de done
Verificable: query SQL que debe devolver 0, log que debe aparecer, etc.
```

### Cuando se resuelve

1. Eliminar el archivo (`rm docs/task/BUG-001-...md`).
2. Eliminar la línea del `INDEX.md`.
3. Mencionar la resolución en el commit (`fix(...): close BUG-001`).
4. Actualizar `09-current-state.md` si afecta el snapshot de estado.

### Cuando aparece deuda nueva

- Cualquier persona/agente que detecte algo digno de tracking lo crea en esta carpeta sin pedir permiso (política durable).
- Agregar al `INDEX.md` ordenado por severity.
- Si dudas si vale la pena: créala con `severity: low`. Es más fácil cerrar que recordar.

## Ejecución autónoma (ventana 23:00–03:00 Bogota)

Las tareas marcadas `auto_eligible: yes` pueden ser programadas con `/schedule` para ejecutarse sin supervisión humana entre las 23:00 y las 03:00 hora Medellín. El flujo de cada ejecución autónoma:

1. **Ejecutar** los pasos del archivo task.
2. **Probar** que se cumple el `Criterio de done` (verificación mecánica: query SQL = 0, archivo existe, etc).
3. **Verificar** idempotencia: re-ejecutar no rompe nada.
4. **Commit + push** con mensaje claro (formato `fix/feat/docs(scope): close ID-NNN — ...`).
5. **Eliminar** el archivo task + la línea del INDEX.md.
6. Si en cualquier paso falla: hasta 3 iteraciones. Si tras 3 sigue mal → `status: blocked` con reporte breve en el archivo, no eliminar.

**Densidad:** 2-3 tareas cortas por noche, o 1 larga. Verificar `est_duration` en el frontmatter.

**Auto-detección de deuda nueva:** si durante la ejecución se descubre deuda no listada (bug colateral, archivo huérfano, configuración rota), crear el archivo correspondiente en `docs/task/` y seguir con la tarea original.

## Tipos de auto_eligible

| Marca | Significado |
|---|---|
| `yes` | Agente puede ejecutar sola: SQL puro, refactor técnico limpio, cleanup, docs técnicos |
| `no` | Requiere humano: input creativo, decisión de negocio, acceso externo, secrets, UX visible |

`auto_eligible_reason` documenta en una línea por qué se marca así.

## Ver también

- [INDEX.md](./INDEX.md) — vista de pájaro de todas las tareas activas.
- [docs/platform/09-current-state.md](../platform/09-current-state.md) — snapshot del estado de la plataforma.
