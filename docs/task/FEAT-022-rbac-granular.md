---
id: FEAT-022
title: RBAC granular — roles formales (owner/admin/editor/viewer) + matriz de permisos + UI
severity: high
type: feature
status: open
auto_eligible: no
est_duration: long
created: 2026-05-12
parent: AUDIT-003-enterprise-readiness-2026-05-12.md
---

# RBAC granular

## Contexto

`organization_members` ya tiene columnas `role text` y `permissions jsonb`, pero:
- No hay matriz formal de qué puede cada rol.
- La UI de "Usuarios y roles" en `OrganizationView` existe sin profundidad de asignación.
- No hay transfer ownership ni invitación con rol.
- RLS policies asumen "miembro = puede" sin distinguir owner/admin/editor/viewer.

Para vender a empresa: cliente debe poder dar viewer-only a un stakeholder externo (auditor, gerente comercial) sin riesgo.

## Scope

### Roles canónicos

| Rol | Lectura | Edición contenido | Sensores/integraciones | Billing | Usuarios/roles | Eliminar org |
|---|---|---|---|---|---|---|
| `owner` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (single owner) |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `editor` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `viewer` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Implementación

1. **Helper SQL** `has_org_role(org_id, min_role)` con jerarquía owner > admin > editor > viewer. Reusable en RLS policies y RPCs.
2. **Migración RLS** — auditar las 153 policies actuales y diferenciar lectura vs escritura por rol:
   - Mutaciones (`brand_*`, `intelligence_entities`, etc.) → exigir `editor`+
   - Billing + integrations + invitaciones → exigir `admin`+
   - Settings críticos org → exigir `owner`
3. **UI Usuarios y roles** (`OrganizationView` tab "users"):
   - Listado: avatar · email · rol · último acceso · acciones (cambiar rol, remover)
   - Invitar: email + selector rol → genera `organization_invitations` con `token`, `expires_at`
   - Transfer ownership: confirm modal (irreversible).
4. **UI Permisos** (tab "permissions"):
   - Matriz de los 4 roles × capabilities, **read-only** en fase 1.
   - Fase 2 (opcional): custom roles con `permissions jsonb` flexible.

### Email de invitación
- Resend template "Te invitaron a {{org_name}} como {{role}}".
- Link `https://aismartcontent.io/invite/{{token}}` valida `organization_invitations`, expira a 7d, acepta crea `organization_members`.

## Criterio de cierre

- [ ] Un `viewer` no puede modificar contenido aunque navegue manualmente la ruta
- [ ] Un `editor` no ve tab Billing
- [ ] Owner puede transferir ownership a admin existente
- [ ] Invite por email funciona end-to-end
- [ ] 153 RLS policies auditadas y, donde aplica, exigen `has_org_role(org_id, min_role)`

## Dependencias

- `FEAT-012` user provisioning end-to-end (alguna superposición — coordinar)
- `FEAT-021` audit log UI lo necesita para gating
