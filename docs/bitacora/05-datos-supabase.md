# 05 — Datos: Supabase

Proyecto `tsdpbqcwjckbfsdqacam`. La base de datos **es el contrato** entre la consola,
el ai-engine y Vera. Casi todo lo que se ve en la app sale de una RPC.

**Regla de trabajo:** la carpeta `SQL/` está en `.gitignore` por diseño. Las
migraciones se aplican por la **Management API** y se ejecutan directamente contra
producción. Consecuencia obligatoria: **los archivos `.sql` locales pueden estar
desactualizados frente a producción.** Antes de editar una RPC hay que leer su
definición real con `pg_get_functiondef`, no confiar en el archivo local. Y tras un
DDL hay que **recargar el caché de esquema de PostgREST**, o el frontend pierde la
sección.

---

## 1. Modelo conceptual

Ver [01-mapa-del-sistema](./01-mapa-del-sistema.md) §3 para el vocabulario. En corto:

- `organizations` = la marca real.
- `brand_containers` = **Mercado** (mismo brand en otro país/idioma/tono).
- `products`, `services`, `brand_entities` cuelgan de la **organización** y se
  comparten entre mercados.

**Deuda de naming reconocida:** los nombres engañan (`brand_container` suena a marca
pero es mercado; `brand_entities` suena a entidades de marca pero son de la
organización). Renombrar sería lo correcto, pero la confusión actual es un costo
recurrente aceptado por ahora.

---

## 2. Métricas y engagement (2026-06-16)

Cómo se mide de forma comparable entre redes que hablan monedas distintas.

**Principio:** se separa la **interacción activa** (cuenta como engagement) del
**alcance pasivo** (views, plays, impresiones, reach — **no** es engagement). La
métrica comparable es la **tasa**: interacciones / alcance.

**Capa de normalización** (`src/lib/platform-metrics.js` en el ai-engine): un catálogo
declarativo que traduce campos nativos a canónicos. **Agregar una red nueva = agregar
su esquema ahí**, sin tocar SQL ni populators.

- Canónicas de interacción: `likes`, `comments`, `shares`, `saves`.
- Canónicas de alcance: `reach`, `impressions`, `views`, `plays`.
- Traducciones: TikTok `view_count`→`plays`; X `impression_count`→`impressions`,
  `retweet`+`quote`→`shares`, `bookmark`→`saves`, `reply`→`comments`; YouTube
  `viewCount`→`views`. Meta ya llega canónico.

**Capa de base de datos** — columnas **generadas** en `brand_posts`:

| Columna | Fórmula |
|---|---|
| `engagement_total` | `likes + comments + shares + saves` — **redefinida**: antes sumaba views/plays e inflaba los videos |
| `reach_total` | `GREATEST(reach, impressions, views, plays)` — evita doble conteo |
| `engagement_rate` | interacciones / alcance, a 4 decimales |

Benchmarks reales verificados: Instagram ~3,9 %, TikTok ~5,2 %, X ~0,45 %. Facebook
sin tasa, porque su API ya no entrega reach.

**Clase de bug sistémica descubierta en la auditoría de RPCs (2026-06-05):** decenas
de RPCs leían claves de `brand_posts.metrics` que **no existen** (`views`, `plays`,
`saves`) y devolvían 0 en silencio. Las reales son `likes, reach, saved, shares,
follows, comments, impressions, video_views, profile_visits, avg_watch_time_ms,
total_interactions`. Se arreglaron ~18 RPCs y 2 vistas materializadas.

---

## 3. Salud de plataforma

`dashboard_mimarca_platform_health` combina cuatro señales por red:

1. Estado de la integración (`active` / `needs_reauth` / `stale`).
2. Actividad (volumen y frescura).
3. `engagement_rate` y `reach_total`.
4. Sentimiento **de los comentarios**, no del post.

Sólo mira `post_source='own'`, que viene de las **integraciones**, no de Apify (Apify
es sólo competencia). Devuelve un score 0-100 con etiqueta y señales.

---

## 4. El teardown del clasificador (desde 2026-07-16)

Decisión: **eliminar todo el subsistema clasificador** (tonos, temas, sentimiento de
post, moods), incluida la tabla `post_patterns`, y sacar la salud de marca de datos
crudos de `brand_posts`.

**Fórmula de salud nueva, aprobada:** cadencia 40 % + impacto 35 % + recencia 25 %,
escala 0-100, todo desde `brand_posts` con `post_source='own'`. El impacto social
ponderado es `4·shares + 3·saved + 3·comments + 1·likes + 0,02·views`.

**Hecho en producción:**

- Se borraron 9 RPCs hoja del clasificador, y luego 20 funciones más ya muertas.
- Se reescribieron desde `brand_posts` (con el contrato de retorno intacto):
  `dashboard_mimarca_health`, `dashboard_mimarca_activity` (que además arregló un bug:
  contaba `is_competitor=false`, que incluye posts de referencia, en vez de
  `post_source='own'`) y `dashboard_brand_engagement_trend`.
- Se eliminaron **8 columnas** del clasificador de `brand_posts`, con respaldo.
- Se desacopló el brain-feed del ai-engine de `post_patterns`.

**Lo que falta (fases 4-final y 5):** 15 funciones siguen usando `post_patterns`,
cuatro vistas materializadas con cron romperían al dropear la tabla, y falta el DROP
de una docena de tablas del subsistema. **Ojo:** `trend_topics` **no** se toca — es
del motor de Tendencias, otro subsistema.

Los respaldos de las ~50 definiciones de función y de los esquemas de tabla están en
`~/.claude/arde-tools/supabase/backups/`.

---

## 5. Aseo de RPCs (2026-07-17)

Método reproducible: correr `plpgsql_check_function_tb` sobre las ~293 funciones
públicas no-trigger, y cruzar el resultado con el esquema real y las llamadas vivas
del frontend.

- **11 funciones borradas** — huérfanas de un esquema viejo: referenciaban tablas
  muertas (`flow_outputs`, `brands`, `scraping_jobs`) o columnas eliminadas
  (`credit_usage.user_id`, `products.beneficio_1`). **No recrearlas.**
- **5 funciones arregladas** — lógica actual con un bug puntual (un `round()` sobre
  doble precisión, un `UNION` con tipos incompatibles, agregados anidados).

**Falso positivo a conocer:** `plpgsql_check` marca `relation "_x" does not exist` en
funciones que usan `CREATE TEMP TABLE ... ON COMMIT DROP`. No están rotas.

Segundo pase sobre funciones de trigger, que destapó dos bugs reales: una tabla sin la
columna `updated_at` que su trigger exigía (**todo UPDATE fallaba**) y un insert con
un rol inexistente en el enum, que rompía el *attach* de visitantes anónimos.

---

## 6. Seguridad de datos

- **Encriptación de tokens en reposo** — AES-256-GCM con clave maestra en variable de
  entorno. Helpers espejados entre el frontend (CommonJS) y el ai-engine (ESM);
  formato `enc_v1:{iv}:{ct+tag}` con detección de texto plano legacy. **Cualquier
  endpoint nuevo que lea `brand_integrations.access_token` debe desencriptar; cualquiera
  que escriba debe encriptar.**
- **Ventana anti-replay de 5 minutos** en los webhooks de Shopify y Meta.
- **Log de auditoría de usuario** (`user_audit_log`), org-scoped por RLS.
- **Filtro cross-tenant**: cinco endpoints elegían `[0]` arbitrariamente entre las
  cuentas accesibles. Ahora respetan las páginas concedidas explícitamente y, si hay
  varios candidatos sin preferencia, devuelven `requires_selection: true` con la lista.

**Bug de seguridad con lección permanente:** un guard de RLS con lógica de tres
valores. Si el predicado de membresía devolvía `NULL` en vez de `false`, el guard
filtraba. **Todo guard de RPC debe hacer `COALESCE` del predicado a `false`.**

**Gotcha operativo:** las RPCs `SECURITY DEFINER` con guard `is_org_member` bloquean al
rol de servicio del ai-engine, así que Vera no puede llamarlas. El arreglo es permitir
explícitamente `auth.role() = 'service_role'`.

**Postura de seguridad frente a competidores** (ManyChat, HubSpot, Sprout, Hootsuite):
los P0 técnicos están cerrados. Pendientes de nivel empresarial: SAML SSO, MFA
exigible por el admin de la organización, RBAC granular (hoy sólo `admin`), DPA
publicable y Trust Center, bug bounty, pentest anual. A 6-18 meses: SOC 2 Type II,
ISO 27001, residencia de datos en la UE.

---

## 7. Retención y limpieza

**Limpieza del 2026-07-03**, motivada por superar el plan gratuito. El desborde era
**Storage (1,36 GB), no la base de datos** (191 MB de 500). Se borró una carpeta
huérfana de 770 MB de una marca de prueba eliminada, se purgó contenido scrapeado de
más de tres meses y se recortó la telemetría.

**Regla permanente:** función `purge_scraped_retention(p_days default 90)` + job de
`pg_cron` diario a las 04:20 UTC. **Sólo borra contenido scrapeado** (posts,
comentarios, temas de tendencias, señales, corridas de sensores y de Apify, caché de
descripciones de media) más telemetría. **Las producciones, estrategias, ADN y
vectores no se tocan.**

**Gotcha:** `brand_posts.captured_at` es la fecha de **publicación del post original**
(hay posts de 2010), no la fecha del scrape. Y borrar filas de `storage.objects` **no
borra el objeto físico**: hay que usar la API de Storage.

---

## 8. Créditos y facturación

**Desde 2026-05-21: 1 crédito = 1 USD** de gasto real en Apify / OpenAI / Claude.
Antes era 1 crédito = $0,10, lo que cobraba diez veces de más.

- Cobro interno con **precisión decimal** (`NUMERIC(12,4)`, migrado desde `(10,2)`
  porque el normalizador redondeaba a cero los gastos de menos de medio centavo).
- **Display al usuario = FLOOR**, vía la vista `v_org_credits_display`. **El frontend
  nunca debe leer `organization_credits.credits_available` directo.**
- Un trigger normalizador corrige automáticamente cualquier componente que envíe un
  delta que no coincida con el USD registrado, y deja rastro de auditoría.
- Se aplicó un **reembolso retroactivo** a los eventos con sobrecobro de 10x.

**Esquema canónico de `credit_usage`:** `{kind, credits_delta, usd_cost, metadata,
source_*}`. Cualquier código que use `credits_used`, `operation_type`, `user_id` o
`description` está roto: esas columnas **no existen**.

**Tiers vivos en producción: Creator, Team y Agency.** No existe Free ni Enterprise.
Free se descartó porque la propuesta es premium (el precio es señal de posicionamiento);
Enterprise, porque hoy no hay capacidades que lo diferencien de Agency.

---

## 9. La capa CMO en la base (2026-07-08)

Tras auditar la biblioteca de funciones con lente de CMO se detectaron huecos
estructurales: penetración (la ley número uno de Byron Sharp, ausente), disponibilidad
física, ocasiones de uso, activos distintivos como equity, el balance marca-vs-activación
(60/40), el precio como palanca, y el tercer vértice del P&L.

**Diagnóstico raíz:** el loop de aprendizaje medía lift de engagement a 7 días, lo que
**castiga sistemáticamente toda jugada de construcción de marca**. Ese era el P0.

Construido en producción, aditivo (13 funciones y 4 tablas nuevas):

- `classify_play_horizon` — etiqueta cada jugada como siembra, cosecha o mixta, más
  las columnas `horizon` en las tablas de acciones y recomendaciones.
- `measure_longterm_outcomes` — mide las jugadas de siembra a **60 días por
  penetración**, no por engagement a 7.
- `compute_penetration_proxy` — proxy desde `brand_posts`. Reveló una verdad
  incómoda: `followers_snapshot` viene nulo para casi todas las marcas, así que **la
  penetración real no se mide sin tracking de seguidores**.
- `compute_brand_vs_activation_split` (doctrina 60/40), `analyze_price_architecture`,
  `compute_distribution_gap` + catálogo de canales, y andamiaje para ocasiones de uso
  y equity de activos.
- **Leads intelligence** — tabla `meta_leads` que guarda el *routing* (campaña,
  conjunto, anuncio, formulario) y campos de calificación, con **PII de contacto
  prohibida por diseño y documentada en un COMMENT**; más `analyze_lead_intelligence`,
  que cruza los leads con el gasto para obtener **CPL real**.

**Corrección de alcance que vale recordar:** la propuesta original incluía un
"conector de CRM". El usuario objetó y tenía razón: **AI Smart Content analiza, no es
un CRM.** Se reemplazó por una capa de "outcome real" cuya fuente depende del cliente:
lead-gen → leads de Meta; e-commerce → órdenes de Shopify/Mercado Libre; marca →
conversiones de Ads/GA4.

**Gate pendiente** (acción externa, no código): la app de Meta necesita
`leads_retrieval` en su `config_id`, revisión de Meta y re-autorización de los
clientes para que los leads fluyan.

---

## 10. Auditoría de arquitectura de base (2026-05-29)

Veredicto: **arquitectura sólida** — RLS en 166 de 167 tablas, llaves primarias
correctas, foráneas declaradas. La deuda es de higiene, acumulada por migraciones
repetidas.

- 🔴 56 funciones `SECURITY DEFINER` sin `search_path` fijo; 23 vistas sin
  `security_invoker`.
- 🟡 15 pares de índices duplicados (por el naming `org` vs `organization_id`); ~17
  índices nunca usados; ~98 foráneas sin índice de cobertura.
- 🟢 4 tablas de respaldo huérfanas; ~43 tablas vacías (mezcla de feature pendiente y
  posibles muertas).

Documentado sin aplicar por decisión del usuario. Lo sustantivo (seguridad e índices)
se aplicó después; el resto conviene **re-auditar antes de corregir**.

**Gotcha de pgvector aprendido:** el *opclass* del índice **debe** coincidir con el
operador de distancia de la consulta, o el planner ignora el índice sin importar el
tamaño del corpus.
