# AUDIT-005 — Fase 1 BD aplicada

**Fecha:** 2026-05-19
**Contexto:** Sigue al AUDIT-005-builder-paas-readiness. Esta fase aplica las migraciones BD que el Builder necesitaba para corregir 3 bugs P0/P1 estructurales.

> La carpeta `SQL/` está gitignored. Las migraciones se aplicaron directo vía Management API.

## 1. `updated_at` en `content_flows` y `flow_modules` (P1-1)

`flow_technical_details` ya tenía `updated_at` + trigger. Las otras dos tablas no, por lo que listados ordenados por "última modificación" eran falsos (caían a `created_at`).

```sql
ALTER TABLE public.content_flows ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;
UPDATE public.content_flows SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

ALTER TABLE public.flow_modules ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.flow_modules ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

DROP TRIGGER IF EXISTS trg_content_flows_updated_at ON public.content_flows;
CREATE TRIGGER trg_content_flows_updated_at
BEFORE UPDATE ON public.content_flows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_flow_modules_updated_at ON public.flow_modules;
CREATE TRIGGER trg_flow_modules_updated_at
BEFORE UPDATE ON public.flow_modules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Reusa la función canónica `public.update_updated_at_column()` que ya existe en el schema con `SET search_path` correcto.

## 2. RPC transaccional `replace_flow_modules` (P0-2 + P0-4)

Antes: `saveTechnicalDetails` hacía 5–N round-trips secuenciales (delete, insert por módulo, update por módulo, upsert tech por módulo). Cualquier 503/timeout dejaba datos colgados. `next_module_id` se hardcodeaba a `null` en el insert inicial.

Ahora: una sola llamada `supabase.rpc('replace_flow_modules', { p_flow_id, p_modules, p_tech })` que:
- Valida permisos con `can_access_flow(p_flow_id)`.
- Valida que cada `id` enviado pertenezca al flujo (no se pueden inyectar módulos de otros flujos).
- Inserta módulos nuevos (sin id) y conserva los existentes.
- Borra módulos no enumerados (y sus `flow_technical_details` antes, por FK no-cascade).
- Recorre todo en orden y setea `next_module_id = next.id` (grafo lineal correcto en BD).
- Upsertea `flow_technical_details` por módulo en bulk usando claves `uuid` o `idx_N`.
- Retorna `[{ step_order, id }, ...]` para que el cliente migre claves `idx_N` → uuid reales.

Todo dentro de la TX implícita de la función `plpgsql` → atómico.

Firma:
```sql
CREATE OR REPLACE FUNCTION public.replace_flow_modules(
  p_flow_id uuid,
  p_modules jsonb,
  p_tech jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp;

GRANT EXECUTE ON FUNCTION public.replace_flow_modules(uuid, jsonb, jsonb) TO authenticated;
```

Errores estándar que lanza:
- `flow_not_found`
- `permission_denied`
- `modules_must_be_array`
- `at_least_one_module_required`
- `module_does_not_belong_to_flow: <uuid>`

Tested:
- ✅ Llamada sin permisos retorna `permission_denied`.
- ✅ Llamada con `00000000-...` retorna `flow_not_found`.
- ✅ Llamada con módulo válido respeta el grafo y `updated_at` se actualiza por trigger.

## 3. RLS endurecida en `flow_technical_details` (P1-16)

Antes: `is_developer()` only — un developer podía leer/escribir tech_details de **cualquier** flujo (incluso ajenos).

Ahora: `is_developer() AND can_access_flow(flow_module_id.content_flow_id)`.

```sql
DROP POLICY IF EXISTS "Tech details" ON public.flow_technical_details;
DROP POLICY IF EXISTS "Tech details access" ON public.flow_technical_details;
CREATE POLICY "Tech details access" ON public.flow_technical_details
FOR ALL TO authenticated
USING (
  public.is_developer()
  AND EXISTS (
    SELECT 1 FROM public.flow_modules fm
    WHERE fm.id = flow_technical_details.flow_module_id
      AND public.can_access_flow(fm.content_flow_id)
  )
)
WITH CHECK (
  public.is_developer()
  AND EXISTS (
    SELECT 1 FROM public.flow_modules fm
    WHERE fm.id = flow_technical_details.flow_module_id
      AND public.can_access_flow(fm.content_flow_id)
  )
);
```

`can_access_flow` ya considera owner OR developer OR collaborator → política consistente con `flow_modules`.

## 4. Cliente JS (`BuilderPersistence.js`)

`saveTechnicalDetails` reemplazada por una sola llamada RPC. Sin fallback: si la RPC no responde, el guardado falla con notificación clara (mejor que dejar BD inconsistente).

El cliente sigue manteniendo `flowTechnicalDetailsByModule` indexado por `uuid` o `idx_N` y migra las claves cuando la RPC devuelve los IDs reales.

## Verificación

- ✅ Schema columns presentes (`content_flows.updated_at`, `flow_modules.{created_at,updated_at}`).
- ✅ Triggers activos (`trg_content_flows_updated_at`, `trg_flow_modules_updated_at`).
- ✅ RPC creada y con `GRANT EXECUTE TO authenticated`.
- ✅ Policy "Tech details access" en `pg_policy`.
- ✅ JS pasa syntax check; firma de payload alineada con la RPC.

## Pendiente de Fase 1 (no aplicado)

Nada — los 3 items P0/P1 BD identificados están aplicados. Quedan los items JS de Fase 2 (auto-save, undo/redo, dry-run, variables `{{ $modulo.output.x }}`, grafo con branching real).
