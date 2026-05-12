---
id: FEAT-021
title: Panel de auditoría para admin del tenant — exponer `user_audit_log`
severity: high
type: feature
status: open
auto_eligible: no
est_duration: medium
created: 2026-05-12
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

# Audit log UI para tenant

## Contexto

La tabla `user_audit_log` ya captura: `user_id`, `user_email`, `organization_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, `request_id`, `metadata`, `created_at`.

Los datos **se escriben** (cerrado en P0 security baseline 2026-05-08), pero **ningún panel los muestra**. Un cliente enterprise debe poder responder a su DPO "¿qué hicieron mis usuarios en los últimos 90 días?" sin pedir export por email.

## Scope

1. **RPC** `get_org_audit_log(org_id, from_ts, to_ts, action_filter?, user_id_filter?, limit, offset)`:
   - RLS-checked vía `is_org_member(org_id)` + rol >= admin
   - Devuelve paginado con total count para UI
   - Index sugerido: `(organization_id, created_at DESC)` si no existe

2. **View nueva** `AuditLogView` (ruta `/org/:short/audit`):
   - Tabla paginada con filtros: rango fechas (default últimos 30d), acción, usuario, recurso
   - Columnas: timestamp · usuario · acción · recurso · IP · request_id (copy-to-clipboard)
   - Detalle expandible muestra `metadata` jsonb completo
   - Export CSV (último filtro aplicado, máx 10K rows)

3. **Acceso:** solo `owner` y `admin` (no `member` ni `viewer`) — depende de `FEAT-022` RBAC granular pero puede arrancar con `role IN ('owner','admin')`.

4. **Retención:** definir política — ¿90d, 1y, forever? Probable `delete from user_audit_log where created_at < now() - interval '1 year'` en cron mensual.

## Criterio de cierre

- [ ] Admin de IGNIS ve sus propios eventos paginados con filtros
- [ ] Un user `member` no puede ver el panel (403)
- [ ] CSV export funciona
- [ ] Retención documentada y, si aplica, cron creado

## Notas

- Posible escalado: si volumen sube, mover a tabla particionada por mes.
- Considerar agregar columna `severity` (info/warn/critical) para filtrado rápido.
