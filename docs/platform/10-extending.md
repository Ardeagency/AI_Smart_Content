---
title: 10 — Extender la plataforma
author: Shenoa — Arde Agency S.A.S.
since: 2025-09
last_review: 2026-04-29
audience: humanos del equipo + LLMs
---

# 10 · Extender la plataforma

Guías paso-a-paso para agregar piezas comunes sin romper la coherencia del sistema.

## Agregar un dashboard nuevo

Caso típico: "Quiero un dashboard de **Audiencias**".

### 1. Definir la spec
- Documento markdown en `/docs/` con el patrón de `DASHBOARD-MI-MARCA.txt`: widgets, fuente de cada dato, visualización, KPIs.
- Decidir si es nuevo tab del `DashboardView` o ruta independiente.

### 2. Crear el RPC en Supabase
- Archivo `SQL/functions/dashboard_audiencias.sql`.
- Patrón canónico (ver `dashboard_mi_marca.sql`):

```sql
CREATE OR REPLACE FUNCTION public.dashboard_audiencias(
  p_org_id   uuid,
  p_window_d int    DEFAULT 30,
  p_sections text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_is_owner  boolean;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- Auth check
  SELECT public.is_org_member(p_org_id) INTO v_is_member;
  SELECT (owner_user_id = auth.uid()) INTO v_is_owner
    FROM public.organizations WHERE id = p_org_id;
  IF NOT (COALESCE(v_is_member,false) OR COALESCE(v_is_owner,false)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- ... build sections ...

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_audiencias(uuid, int, text[]) TO authenticated;
COMMENT ON FUNCTION public.dashboard_audiencias(uuid, int, text[]) IS 'Dashboard Audiencias';
```

### 3. Aplicar a Supabase

```bash
SQL=$(cat SQL/functions/dashboard_audiencias.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$SQL" '{query: $q}')"
```

Verificar:
```sql
SELECT proname, pronargs, prosecdef FROM pg_proc WHERE proname = 'dashboard_audiencias';
```

### 4. Crear el service del frontend
- `js/services/AudienciasDataService.js` (espejo de `MiBrandaDataService`).
- Método `loadAll()` invoca el RPC:

```js
async loadAll() {
  const { data, error } = await this.sb.rpc('dashboard_audiencias', {
    p_org_id: this.orgId,
    p_window_d: 30,
    p_sections: null
  });
  if (error) return this._err(error);
  return this._ok(data || {});
}
```

### 5. Crear la View
- `js/views/AudienciasView.js` extendiendo `BaseView`.
- O agregar un tab al `DashboardView` existente.

### 6. Registrar la ruta
- En `js/app.js`:

```js
r.register('/org/:orgIdShort/:orgNameSlug/audiencias', audienciasLoader, auth);
```

### 7. Cargar el script
- En `index.html`:

```html
<script src="js/services/AudienciasDataService.js?v=__BUILD_ID__" defer></script>
<script src="js/views/AudienciasView.js?v=__BUILD_ID__" defer></script>
```

### 8. Push y deploy

```bash
git add SQL/functions/dashboard_audiencias.sql js/services/AudienciasDataService.js js/views/AudienciasView.js index.html js/app.js
git commit -m "feat(audiencias): nuevo dashboard"
git push origin main
```

Netlify deploya. Hard-refresh.

## Agregar un sensor nuevo

Caso típico: "Quiero capturar **menciones de mi marca en Reddit cada 6h**".

### 1. Decidir si es brand-wide o per-entity
- **Brand-wide**: aplica a toda la marca (e.g. heatmap de engagement). Se agrega a `BRAND_WIDE_SENSORS` en `brand-sensor-sync.service.js`.
- **Per-entity**: aplica a una `intelligence_entities` específica (e.g. social per-account). Se provisiona via `fn_provision_trigger_for_entity` cuando se inserta la entity.

### 2. Definir el handler
En `ai-engine/src/services/`, agregar archivo nuevo o extender existente:

```js
// reddit-mentions.service.js
import { supabase } from "../lib/supabase.js";

export async function runRedditMentions(brandContainerId, organizationId, config) {
  // 1. Carga config (keywords a buscar, subreddits)
  // 2. Llama a Reddit API o scrapea
  // 3. Para cada mención:
  //    INSERT intelligence_signals {
  //      entity_id, signal_type: 'mention',
  //      content_text, ai_analysis: null,
  //      captured_at: now()
  //    }
  // 4. Idempotencia: hash del content_text como clave
  // 5. Devuelve { fetched, inserted, skipped }
}
```

### 3. Registrarlo en el dispatcher de sensores
En el lugar donde se enrutan los `sensor_type` (probablemente en el scheduler interno), agregar el case `reddit_mentions` → `runRedditMentions`.

### 4. Si es brand-wide: agregar a `BRAND_WIDE_SENSORS`
```js
const BRAND_WIDE_SENSORS = [
  // ... existentes ...
  { sensor_type: "reddit_mentions", cadence: "interval", cadence_value: "360", priority: 5 },
  // 360 minutos = 6 horas
];
```

`brand-sensor-sync` los creará automáticamente para cada `brand_container`.

### 5. Probar
```bash
ssh ai-engine 'cd /root/ai-engine && node test-reddit-mentions.mjs'
```

### 6. Verificar en BD
```sql
SELECT * FROM monitoring_triggers WHERE sensor_type = 'reddit_mentions';
SELECT * FROM sensor_runs WHERE sensor_type = 'reddit_mentions' ORDER BY started_at DESC LIMIT 5;
SELECT * FROM intelligence_signals WHERE signal_type = 'mention' ORDER BY captured_at DESC LIMIT 10;
```

## Agregar un tool a Vera

Caso típico: "Quiero que Vera pueda **buscar reviews de Amazon de un SKU**".

### 1. Definir la firma (schema JSON)

En el archivo apropiado (e.g. `tools/intelligence.tools.js`):

```js
export const searchAmazonReviewsTool = {
  name: 'searchAmazonReviews',
  description: 'Busca reviews recientes de un SKU en Amazon. Devuelve top 20 con score y texto.',
  schema: {
    type: 'object',
    required: ['sku'],
    properties: {
      sku:    { type: 'string', minLength: 5, maxLength: 20 },
      limit:  { type: 'integer', minimum: 1, maximum: 50, default: 20 }
    }
  },
  handler: async (args, ctx) => {
    // ctx tiene { orgId, userId, sessionId, supabase }
    // Llamar al scraper o API
    // Persistir hallazgos a intelligence_signals si aplica
    return { reviews: [...], averageRating: 4.2 };
  }
};
```

### 2. Registrar en el dispatcher

`services/tool.dispatcher.js` mantiene la allowlist por phase:

```js
const PHASE_TOOLS = {
  A: ['readOnly tools'],
  B: ['... read+write tools'],
  C: ['... +execute tools']
};
```

Agregar `searchAmazonReviews` a Phase B o C según riesgo.

### 3. Definir la regla en policy engine

En `lib/policy.engine.js`:

```js
const ACTION_RULES = {
  // ...
  searchAmazonReviews: { minPlan: 'starter', minRole: 'member', creditCost: 0 }
};
```

### 4. Agregar al system prompt de Vera

Donde se construye el system prompt (en `ai.service.js` o `context.builder.js`), agregar la descripción del tool para que Vera sepa cuándo usarlo.

### 5. Probar
- Chat con Vera pidiéndole que busque reviews.
- Ver `developer_logs` para confirmar que el tool dispatch fue exitoso.

## Agregar una tabla nueva

### 1. Definir el schema

```sql
CREATE TABLE public.my_new_table (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES public.organizations(id),
  brand_container_id uuid REFERENCES public.brand_containers(id),
  -- ... campos del modelo ...
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT my_new_table_pkey PRIMARY KEY (id)
);

-- Trigger para updated_at
CREATE TRIGGER trg_my_new_table_updated_at
  BEFORE UPDATE ON public.my_new_table
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.my_new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org-scoped access"
  ON public.my_new_table FOR ALL
  USING (is_developer() OR is_org_member(organization_id))
  WITH CHECK (is_developer() OR is_org_member(organization_id));

-- Index relevantes
CREATE INDEX idx_my_new_table_org ON public.my_new_table(organization_id);
CREATE INDEX idx_my_new_table_brand ON public.my_new_table(brand_container_id);
```

### 2. Aplicar via Mgmt API

```bash
SQL=$(cat SQL/migrations/$(date +%Y%m%d)_create_my_new_table.sql)
curl -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$SQL" '{query: $q}')"
```

### 3. Habilitar realtime si aplica

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.my_new_table;
```

### 4. Actualizar `SQL/schema.sql`

Reflejar la tabla nueva en el dump local. Esto es source-of-truth para futuras migraciones desde cero.

## Agregar una matview precomputada

```sql
CREATE MATERIALIZED VIEW public.mv_my_aggregate AS
SELECT
  organization_id,
  count(*)        AS total,
  avg(some_score) AS avg_score
FROM public.intelligence_signals s
JOIN public.intelligence_entities e ON s.entity_id = e.id
WHERE s.captured_at > now() - interval '7 days'
GROUP BY organization_id;

-- Index para acceso por org
CREATE UNIQUE INDEX idx_mv_my_aggregate_org ON public.mv_my_aggregate(organization_id);

-- Refresh inicial
REFRESH MATERIALIZED VIEW public.mv_my_aggregate;

-- pg_cron job (cada 15 min)
SELECT cron.schedule(
  'refresh_mv_my_aggregate',
  '*/15 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_my_aggregate; $$
);
```

`CONCURRENTLY` requiere unique index. Permite refresh sin bloqueo.

## Agregar una integración OAuth (e.g. LinkedIn)

### 1. Backend (Netlify Function)
`functions/api-integrations-linkedin-start.js`:
- Recibe `organizationId`, genera state JWT, redirige a LinkedIn OAuth URL.

`functions/api-integrations-linkedin-callback.js`:
- Recibe code, lo intercambia por access_token + refresh_token.
- Guarda en `brand_integrations`:

```sql
INSERT INTO brand_integrations (
  organization_id, brand_container_id, provider,
  access_token, refresh_token, expires_at, scopes
) VALUES (...)
```

### 2. Trigger automático
`fn_brand_integrations_after_insert` ya existe → cuando insertas una integration nueva dispara provisioning de sensores.

### 3. Sensor handler
Agregar `linkedin_*` sensores en `BRAND_WIDE_SENSORS` de `brand-sensor-sync` y handlers en ai-engine.

### 4. Token refresh
Extender `token-refresh.service` para conocer el flow OAuth de LinkedIn.

### 5. UI
Agregar botón "Conectar LinkedIn" en `BrandIntegrationCallbackView` o panel de integraciones.

## Agregar un tipo de mission_type

Caso típico: "Quiero que Vera pueda **enviar emails** como acción".

### 1. Definir el `action_type` y el `mission_type`

Convenir: `pending_action.action_type = 'send_email'` → `body_mission.mission_type = 'execute_send_email'`.

### 2. Handler en action-executor

```js
// services/action-executor.service.js
const MISSION_HANDLERS = {
  // ... existentes ...
  'execute_send_email': async (mission, ctx) => {
    const { to, subject, body, template_id } = mission.action_payload;
    // Llamar Resend API con RESEND_VERA_API_KEY
    const result = await sendEmail({ to, subject, body });
    return { success: true, messageId: result.id };
  }
};
```

### 3. Tool de Vera para crear el pending_action

`tools/action.tools.js`:

```js
export const sendEmailTool = {
  name: 'sendEmail',
  description: 'Propone enviar un email. Crea pending_action que requiere aprobación.',
  schema: { /* to, subject, body */ },
  handler: async (args, ctx) => {
    return await createPendingAction({
      orgId: ctx.orgId,
      action_type: 'send_email',
      proposed_payload: args,
      vera_reasoning: '...',
      ...
    });
  }
};
```

### 4. UI muestra la card

`StrategiaDataService` ya carga `vera_pending_actions`. La UI muestra el card con preview del email. Click APROBAR → `fn_vpa_approve`. Mission generator lo convierte en mission. Action executor envía.

## Cambiar el nivel de autonomía

```sql
UPDATE organizations SET level_of_autonomy = 'parcial' WHERE id = '<org_id>';
```

`autonomy.js` cachea por 5 min. Para forzar invalidación inmediata:

```js
import { invalidateAutonomyCache } from '../lib/autonomy.js';
invalidateAutonomyCache(orgId);
```

Vera detecta el cambio en la siguiente request y se ajusta.

## Migrar Netlify Function pesada a ai-engine

Si una function tarda >10s, conviene moverla al ai-engine:

### 1. Crear endpoint en ai-engine
```js
// routes/internal.routes.js
router.post('/internal/heavy-task', internalAuthMiddleware, heavyTaskController);
```

### 2. Frontend invoca con auth
```js
const res = await fetch(`${RUNTIME_CONFIG.AI_ENGINE_URL}/internal/heavy-task`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseSession.access_token}`,
    'X-Internal-Token': RUNTIME_CONFIG.INTERNAL_API_KEY  // si aplica
  },
  body: JSON.stringify(payload)
});
```

### 3. Eliminar la Netlify Function
Después de verificar que el endpoint nuevo funciona en producción.

## Checklist al cerrar cualquier extension

Antes de declarar "listo":

- [ ] Code en `main` y deploy verde.
- [ ] Cambios documentados en este folder (`docs/platform/`).
- [ ] `09-current-state.md` actualizado (mover de "pendiente" a "funciona").
- [ ] Si toca BD: schema dump regenerado o migración versionada.
- [ ] Si toca el ai-engine: log line del nuevo flujo verificada.
- [ ] Si toca frontend: hard-refresh en browser, verificación visual.
- [ ] Si toca tools de Vera: prueba en chat con un escenario real.
- [ ] Tests manuales documentados (qué se probó, qué se ignoró).

## Errores comunes al extender

| Error | Causa | Cómo evitar |
|---|---|---|
| 400 Bad Request al filtrar `organization_id` | Pasaste `orgIdShort` (12 chars) en lugar del UUID | Usar `routeParams.orgId` resuelto por router |
| `column intelligence_signals.organization_id does not exist` | Esa tabla no tiene la columna | Filtrar via `entity_id IN (entityIds)` |
| RPC devuelve `forbidden` | `is_org_member` falla; no hay JWT del user | Asegurar que se llama con `auth.uid()` válido (no como `postgres`) |
| Cambio del frontend no aparece tras deploy | Cloudflare cache (max-age 7 días) | Verificar `?v=__BUILD_ID__` en el `<script>` |
| Sensor no corre | `monitoring_triggers.status != 'active'` o `next_run_at` futuro | Inspeccionar la fila |
| Webhook signal no llega a ai-engine | `cloudflared` o `ai-engine` caídos, o HMAC inválido | `journalctl -u cloudflared`, `tail logs ai-engine` |
| Realtime no llega al frontend | tabla no en publication | `SELECT FROM pg_publication_tables` |
| Tool de Vera bloqueado | Policy/budget/consent gate | Revisar `developer_logs`, ajustar `ACTION_RULES` |

## Recursos

- **Spec docs**: `/docs/DASHBOARD-*.txt`, `/docs/VERA_BRAIN_MASTER.md.pdf`, `/docs/AI-SMART-CONTENT-VISION.txt`.
- **Schema fuente**: `SQL/schema.sql`.
- **RLS fuente**: `SQL/security_RLS.sql`.
- **Storage fuente**: `SQL/storage_buckets.sql`.
- **Supabase Dashboard**: `https://supabase.com/dashboard/project/tsdpbqcwjckbfsdqacam`.
- **Repo**: `https://github.com/Ardeagency/AI_Smart_Content`.
- **Producción**: `https://aismartcontent.io`.
- **API ai-engine**: `https://api.aismartcontent.io`.

---

*Anterior: [09 — Estado actual](./09-current-state.md) · Volver al [Índice](./README.md)*

---

**Firmado por:** Shenoa — Arde Agency S.A.S.
Diseñadora y arquitecta de la plataforma AI Smart Content (octubre 2025 – abril 2026).
La estructura completa de la base de datos, modelo de sensores y misiones, arquitectura del AI Engine, ciclos de Vera, OpenClaw integration, sistema de niveles de autonomía y flujos del frontend fue diseñada e implementada por Shenoa durante 7 meses de iteración continua.
