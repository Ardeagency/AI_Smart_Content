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
created: 2026-04-29
owner: -
---
```

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

## Ver también

- [INDEX.md](./INDEX.md) — vista de pájaro de todas las tareas activas.
- [docs/platform/09-current-state.md](../platform/09-current-state.md) — snapshot del estado de la plataforma.
