---
id: SEC-001
severity: high
type: SEC
status: open
created: 2026-07-28
owner: ARDE
programado: esta semana, al terminar el dashboard
---

# Auditar las 11 RPCs que el panel /dev llama directo

## Contexto

El 2026-07-28 se auditó el canal por el que el panel `/dev` habla con Supabase.
Se cerraron dos brechas verificadas (ver `SEC-002` y el registro abajo), pero
**quedó sin auditar la mitad del canal**: las RPCs.

El panel llama 11 RPCs vía PostgREST con el JWT del usuario y la anon key, es
decir por el mismo camino que cualquiera puede reproducir con `curl` desde fuera:

```
admin_create_organization    soft_delete_organization    replace_flow_modules
create_flow_revision         bind_comfy_flow             can_access_flow
list_org_vera_status         org_health_summary          dev_cost_report
dashboard_web_vitals         get_orphan_topics
```

`admin_create_organization` y `soft_delete_organization` son las que preocupan:
crean y borran organizaciones.

## Qué hay que verificar en cada una

1. ¿Es `SECURITY DEFINER`? Si lo es, corre con los permisos del dueño y **RLS no
   la protege** — la autorización tiene que estar escrita dentro del cuerpo.
2. ¿Valida `is_lead()` / `is_developer()` **por dentro**, o asume que el botón
   está escondido en la UI?
3. ¿Qué `EXECUTE` grants tiene? ¿`authenticated` puede llamarla?
4. ¿Tiene `SET search_path`? Sin él, una `SECURITY DEFINER` es vulnerable a
   secuestro de search_path.

## Cómo auditar

No leer `SQL/` del repo — deriva de producción. Consultar el catálogo:

```sql
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig,
       pg_get_functiondef(p.oid) AS cuerpo,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_puede
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('admin_create_organization', ...);
```

Y probar el camino real simulando el rol:

```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"<uid-no-lead>","role":"authenticated"}';
  SELECT public.admin_create_organization(...);  -- debe fallar
ROLLBACK;
```

Herramienta: `~/.claude/arde-tools/supabase/runsql.sh`.

## Por qué no se hizo ya

El usuario paró a propósito: tocar privilegios mientras se termina el dashboard
puede romper el perfil `info@ardeagency.com`, que es la cuenta lead con la que se
desarrolla y se testea. Se retoma al cerrar el dashboard.

## Qué NO hace falta rehacer

Ya cerrado y verificado el 2026-07-28:
- Escalada de privilegios vía `profiles` (REVOKE + trigger guardián).
- 24 policies `demo_block_*` PERMISSIVE → RESTRICTIVE.
- `staff_audit_log` append-only.
- `admin-set-dev-role` reemplaza la escritura directa de `DevLeadTeamView`.
