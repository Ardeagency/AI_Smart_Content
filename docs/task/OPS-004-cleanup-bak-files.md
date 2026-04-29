---
id: OPS-004
title: Limpiar archivos .bak.* con > 30 días en ai-engine
severity: low
type: ops
status: open
created: 2026-04-29
owner: -
---

# OPS-004 · Cleanup de archivos .bak

## Síntoma

`ssh ai-engine 'ls /root/ai-engine/src/services/' | grep .bak | wc -l` muestra 20+ archivos `.bak.{tag}` con tags como `B1`, `phase4`, `noai`, `20260417`, etc. Algunos tienen meses.

Git history preserva todo cambio, así que `.bak` con > 30 días son redundantes y ensucian el listado.

## Acción

```bash
ssh ai-engine '
  find /root/ai-engine/src -name "*.bak.*" -type f -mtime +30 -print
  # Revisar lista, luego:
  find /root/ai-engine/src -name "*.bak.*" -type f -mtime +30 -delete
'
```

⚠️ **Validar antes de borrar** — algunos `.bak` recientes pueden estar en uso por iteración activa. Borrar solo los > 30 días.

Considerar hacer commit con todo el código actual al repo del ai-engine (si no está ya) antes de borrar — para tener respaldo redundante.

## Criterio de done

- `find /root/ai-engine -name "*.bak.*" -mtime +30` devuelve vacío.
- Listing de directorios más limpio.
- Si hay cambios en el repo del ai-engine: commit + push.
