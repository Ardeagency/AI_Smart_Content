---
id: OPS-001
title: Configurar snapshots semanales de Hetzner CCX33
severity: low
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere acceso a Hetzner Console del usuario
est_duration: short
created: 2026-04-29
owner: -
---

# OPS-001 · Hetzner snapshots

## Síntoma / riesgo

Hoy la VM Hetzner CCX33 no tiene snapshots automáticos. Si la VM muere o el `.env` se corrompe, recuperar manualmente toma horas (clonar repo, rebuild, reconfigurar OAuth, regenerar tokens).

## Acción

1. Hetzner Cloud Console → Servers → seleccionar VM → tab "Snapshots".
2. Crear primer snapshot manual ahora (baseline).
3. Configurar regla de retención:
   - Snapshot semanal automático (domingo 04:00 UTC).
   - Retención: últimos 4 snapshots (1 mes).
4. Costo: ~€0.01/GB/mes × 8GB usados ≈ €0.08/mes.

## Criterio de done

- Mínimo 1 snapshot existe.
- Política automática activa visible en consola.
- Documentado en `docs/platform/08-deployment.md` sección "Backups".
