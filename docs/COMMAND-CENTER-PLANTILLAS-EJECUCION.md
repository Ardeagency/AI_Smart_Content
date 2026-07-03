# Command Center — Plantillas de ejecución por plataforma (Jerarquía v2, fase roja)

> Plan maestro. Visión aprobada 2026-07-02; implementación iniciada 2026-07-03.
> Contexto previo: fase verde ya desplegada (`marketing_budget` en `brand_containers`,
> objetivo=técnico / brief=creativo, presupuesto se define en INFO y se consume en el canvas).

## 1. Visión

El Command Center deja de terminar en el Brief. Después del Brief viene la **ejecución**:
plantillas de 3 niveles que Vera llena, el humano aprueba y el engine ejecuta, conectadas
a lo REAL (campaña sincronizada de la plataforma + producciones de `runs_outputs`).

```
Objetivo (técnico) → Audiencia → Brief (creativo) → PLANTILLA DE EJECUCIÓN
                                                      ├─ Campaña de {Meta|Google|TikTok|X}
                                                      │    └─ Conjunto de Anuncios (1..n)
                                                      │         └─ Anuncio (1..n)
                                                      └─ Optimización de {Shopify|Mercado Libre}
```

**Guardrails acordados**
- NO clonar Ads Manager: solo campos de estrategia/orquestación. El detalle fino vive en la plataforma.
- Plantillas neutrales al objetivo: awareness es tan primera-clase como conversión.
- Lo específico de cada plataforma va en `metadata jsonb`, no en columnas nuevas.

## 2. Modelo de datos (Supabase)

### Nivel 1 — Campaña: tabla `campaigns` EXISTENTE (sin cambios de schema)
Una plantilla de campaña = fila concepto (`last_synced_at IS NULL`) con `platform` preseteada
(`meta|google|tiktok|x`). Ya tiene presupuesto, fechas, `platform_objective`, `brief_id`,
`persona_id` y `external_campaign_id` para el link a lo real. La paleta crea estas filas
con `created_via='command_center'`.

### Nivel 2 — `campaign_adsets` (NUEVA)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid pk | |
| organization_id / brand_container_id | uuid not null | mismo patrón multi-org |
| campaign_id | uuid not null → campaigns ON DELETE CASCADE | padre |
| created_by | uuid | |
| nombre | text not null | |
| descripcion | text | |
| optimizacion | text | hacia qué optimiza (conversión, alcance, leads…) — neutral |
| persona_id | uuid → audience_personas | audiencia del conjunto |
| budget_daily / budget_total / budget_currency | numeric/numeric/text | |
| starts_at / ends_at | timestamptz | |
| external_adset_id | text | link a lo real (`ad_insights_daily.external_adset_id`) |
| status | text default 'draft' | draft→approved→live→done |
| position | int default 0 | orden entre hermanos |
| metadata | jsonb default '{}' | campos por plataforma |
| created_at / updated_at | timestamptz | |

### Nivel 3 — `campaign_ads` (NUEVA)
| Columna | Tipo | Notas |
|---|---|---|
| id / organization_id / brand_container_id / created_by | | ídem |
| adset_id | uuid not null → campaign_adsets ON DELETE CASCADE | padre |
| nombre | text not null | convención `[TIPO][N°] - [objetivo]` |
| output_id | uuid → runs_outputs | el creativo PRODUCIDO |
| texto_principal / titulo / descripcion | text | copy del anuncio (ancla de intención) |
| cta / cta_url | text | |
| external_ad_id | text | link a lo real |
| status / position / metadata / timestamps | | ídem adsets |

### Optimización de tienda — `store_optimizations` (NUEVA)
Conecta con la promesa write-back SEO/GEO de botón humano (política de writes de integraciones).
| Columna | Tipo | Notas |
|---|---|---|
| id / organization_id / brand_container_id / created_by | | ídem |
| platform | text not null | 'shopify' \| 'mercadolibre' (extensible: amazon) |
| integration_id | uuid | integración de la marca |
| nombre / descripcion | text | ej. "SEO temporada Día de Madres" |
| product_id | uuid → products | producto interno (opcional) |
| external_product_id | text | listing en la plataforma |
| seo_titulo / seo_descripcion | text | propuesta de ficha |
| seo_keywords | text[] | |
| starts_at / ends_at | timestamptz | ventana estacional |
| status | text default 'draft' | draft→approved→applied |
| applied_at | timestamptz | cuándo se hizo el write-back |
| metadata / timestamps | | |

**RLS**: mismo patrón de `campaigns` — select/insert/update/delete vía
`EXISTS(brand_containers bc WHERE bc.id=brand_container_id AND is_org_member(bc.organization_id))`
(+ `user_id=auth.uid()` y `is_developer()` en select, + demo_block para anónimos).

**Canvas**: `canvas_node_placements.node_type` gana `'adset' | 'ad' | 'store_optimization'`.
Las aristas campaña→conjunto→anuncio son SEMÁNTICAS (derivadas de FK, como `campaigns.brief_id`),
no filas de `canvas_edges`.

**Saneo**: normalizar edges viejas con tipos truncados (`camp`→`campaign`, `aud`→`audience`,
`briefs`→`brief`) en `canvas_edges`.

## 3. Frontend (Command Center)

Prefijos de key: `adset:<id>`, `ad:<id>`, `stopt:<id>`. Registro en `_keyFromPlacement` /
`_typeAndIdFromKey` / `_typeFromKey` (CanvasStore.js ~2528-2556).

- **Paleta** (`_nodosCatalog`): grupo nuevo **"Ejecución"** con creadores (no solo drag de
  existentes): Campaña de Meta / Google Ads / TikTok / X, Optimización de Shopify,
  Optimización de Mercado Libre. Crear = insertar fila + placement en el centro del viewport.
- **Nodos**: campaña plantilla reusa `_nodeCampaignHTML` (rama concepto) mostrando la
  plataforma como badge; adset y ad tienen render propio compacto con botón "+" para crear
  hijo (patrón n8n). Optimización de tienda = nodo con badge de plataforma y ventana estacional.
- **Inspectores** (`_buildInspectorContent`):
  - `adset:` nombre, optimización, audiencia (select de personas), presupuesto, fechas, estado.
  - `ad:` nombre, creativo (picker de `runs_outputs` de la marca con preview), texto principal,
    título, descripción, CTA + URL, estado.
  - `stopt:` plataforma, producto, SEO (título/descripción/keywords), ventana, estado con
    gate de aprobación (applied solo vía botón humano — fase amarilla).
- **Aristas semánticas**: campaign→adset (FK `campaign_id`), adset→ad (FK `adset_id`),
  pintadas junto a las derivadas existentes (Canvas.mixin.js ~110-122).
- **Estética**: monocromo premium (sin naranja legacy), tokens del design system.

## 4. Conexión a lo real (fase amarilla — siguiente)

- `external_adset_id`/`external_ad_id` casan la plantilla con los satélites reales que ya
  pinta `_renderCampaignSatellites` (`ad_insights_daily`).
- `output_id` casa el anuncio con la producción (`runs_outputs` ya carga `campaign_id`,
  `external_ad_id`, `external_platform` — FEAT-037).
- Botón "Aplicar" de `store_optimizations` ejecuta el write-back a Shopify/ML (gate humano).
- Paso 7 de la secuencia SOSTAC: "Ejecución armada" (plantilla completa: ≥1 conjunto con
  audiencia + ≥1 anuncio con creativo).

## 5. Estado

- [x] Fase verde (presupuesto + técnico/creativo) — commits `3798807b`, `ba57ddfe`
- [x] Schema fase roja aplicado a prod 2026-07-03 (`campaign_adsets`, `campaign_ads`,
      `store_optimizations` + RLS + realtime + `x_ads` en platform check + saneo edges)
- [x] Paleta grupo Ejecución (cards creadoras) + creación de nodos + hijos desde inspector
- [x] Renders + aristas semánticas (FK campaign→adset→ad, aud→adset, product→stopt) + 3 inspectores
- [ ] Fase amarilla: linking a real (casar external_adset_id/external_ad_id con satélites),
      write-back tienda con botón humano, paso SOSTAC 7 "Ejecución armada"
