# n8n flows traducidos desde ComfyUI

Carpeta donde viven los workflows n8n que **replican la logica** de los JSON de ComfyUI entregados por el director creativo en `github.com/Ardeagency/flows_vera`.

Cada workflow aqui es la version ejecutable en produccion del JSON de ComfyUI correspondiente. El JSON de ComfyUI queda como **plano de diseño**, no se ejecuta.

---

## Flows incluidos

| Archivo | Equivalente ComfyUI | Workflow n8n ID | Estado |
|---|---|---|---|
| `ignis-hero-ingredientes.n8n.json` | `ignis/cat01_hero_ingredientes` (30 nodos) | `rufwjwKu2DDupGPP` | **Subido a n8n cloud, INACTIVO** |

---

## 1) `ignis-hero-ingredientes.n8n.json`

### Que hace

Replica el flow `cat01_hero_ingredientes` de Saul. Genera **6 outputs** por ejecucion:

- 3 imagenes Hero con NanoBanana Pro (AFTERBURN, BLACK CORE, OVERDRIVE)
- 3 videos 5s con Kling 3.0 Pro (1 por imagen como first_frame)

### Cambio frente a la version ComfyUI

| Aspecto | ComfyUI (Saul) | n8n (produccion) |
|---|---|---|
| Numero de nodos | 30 | **7** (paralelismo + polling consolidado en Code nodes) |
| Tiempo de ejecucion | ~9-12 minutos (serie) | **~3-5 minutos (paralelo real)** |
| Imagenes de input | 3 productos + 2 refs (LoadImage) | URLs en el payload del webhook |
| Concurrencia entre orgs | Cola unica | Nativa (cada exec aislada) |

La diferencia mas importante: en ComfyUI los 3 nodos NanoBanana se ejecutan **uno detras de otro**. En el workflow n8n los 3 corren con `Promise.all()`, en paralelo real. Mismo para los videos.

### Estructura del workflow

```
[Webhook]
   ↓
[Validate & Prepare]   ← extrae productos, refs, prompts del body
   ↓
[Generate 3 NanoBanana Images]   ← 3 calls paralelo + polling cada 8s, max 4min
   ↓
[Generate 3 Kling Videos]   ← 3 calls paralelo + polling cada 10s, max 6min
   ↓
[Build Callback Payload]   ← arma estructura de 6 outputs
   ↓
[Callback to Platform]   ← POST al callback_url (rpc_ingest_flow_output o similar)
   ↓
[Respond to Webhook]   ← devuelve { ok, schedule_id, outputs_count } al disparador
```

### Como se invoca

Una vez activado en n8n, la URL del webhook es:

```
https://ardeagency.app.n8n.cloud/webhook/ignis-hero-ingredientes
```

(o `/webhook-test/` mientras se prueba en modo Test antes de activar).

### Body esperado (POST JSON)

```json
{
  "schedule_id": "uuid-de-flow_schedules",
  "products": [
    {
      "name": "AFTERBURN",
      "url": "https://<bucket>/products/ignis_afterburn.png",
      "prompt_override": null,
      "video_prompt_override": null,
      "save_path_image": null,
      "save_path_video": null
    },
    {
      "name": "BLACK CORE",
      "url": "https://<bucket>/products/ignis_blackcore.png"
    },
    {
      "name": "OVERDRIVE",
      "url": "https://<bucket>/products/ignis_overdrive.png"
    }
  ],
  "references": [
    "https://<bucket>/refs/reference_style_01.jpg",
    "https://<bucket>/refs/reference_style_02.jpg"
  ],
  "aspect_ratio": "1:1",
  "resolution": "2K",
  "output_format": "png",
  "video_duration": 5,
  "video_aspect_ratio": "1:1",
  "callback_url": "https://aismartcontent.io/.netlify/functions/flow-callback"
}
```

**Defaults aplicados si no se mandan:**

- `aspect_ratio` → `"1:1"`
- `resolution` → `"2K"`
- `output_format` → `"png"`
- `video_duration` → `5`
- `video_aspect_ratio` → `"1:1"`
- `prompt_override` → prompt completo de Saul para esa variante (AFTERBURN/BLACK CORE/OVERDRIVE)
- `save_path_image` → `ignis/cat01/<nombre>_hero`
- `save_path_video` → `ignis/cat01/<nombre>_hero_reel`

### Que devuelve

**Respuesta sincronica del webhook** (al final del flow):

```json
{
  "ok": true,
  "schedule_id": "<uuid>",
  "outputs_count": 6
}
```

**Payload que manda al `callback_url`** (lo que tu plataforma debe procesar para popular `runs_outputs`):

```json
{
  "schedule_id": "<uuid>",
  "flow_slug": "ignis-cat01-hero-ingredientes",
  "outputs": [
    {
      "kind": "image",
      "product_name": "AFTERBURN",
      "storage_path": "ignis/cat01/afterburn_hero",
      "external_url": "https://kie.ai/results/...",
      "provider": "kie.ai",
      "model": "nano-banana-pro",
      "external_task_id": "task-xxx",
      "metadata": { "aspect_ratio": "1:1", "resolution": "2K", "prompt_used": "..." }
    },
    { "kind": "video", "product_name": "AFTERBURN", "external_url": "...", "model": "kling-3.0/video", ... },
    ... (6 outputs totales)
  ]
}
```

---

## 2) Variables de entorno requeridas en n8n

En el dashboard de n8n cloud (Settings → Variables):

| Variable | Valor | Para |
|---|---|---|
| `KIE_API_KEY` | el mismo de Netlify | Los nodos Code que llaman a `api.kie.ai` |

**No** se usan credentials de n8n (httpHeaderAuth) porque los Code nodes hacen las llamadas con `fetch()` directo leyendo `$env.KIE_API_KEY`.

---

## 3) Pasos para probar el flow

### Paso A — Revisar visualmente en n8n
1. Abrir `https://ardeagency.app.n8n.cloud/workflow/rufwjwKu2DDupGPP`
2. Verificar que los 7 nodos esten conectados linealmente
3. Abrir cada Code node y leer el codigo (especialmente `Generate 3 NanoBanana Images` y `Generate 3 Kling Videos`)
4. Ajustar prompts default en `Validate & Prepare` si quieres cambiar la voz creativa

### Paso B — Configurar `KIE_API_KEY`
1. Settings → Variables → New
2. Name: `KIE_API_KEY`
3. Value: el mismo que esta en Netlify env vars

### Paso C — Test manual con datos reales de IGNIS
1. En n8n, click "Execute Workflow" (con el webhook en modo Test)
2. Copiar la URL test que n8n te da
3. Desde terminal:

```bash
curl -X POST "https://ardeagency.app.n8n.cloud/webhook-test/ignis-hero-ingredientes" \
  -H "Content-Type: application/json" \
  -d '{
    "schedule_id": "00000000-0000-0000-0000-000000000001",
    "products": [
      {"name": "AFTERBURN", "url": "https://<URL_REAL_LATA_ROJA>"},
      {"name": "BLACK CORE", "url": "https://<URL_REAL_LATA_NEGRA>"},
      {"name": "OVERDRIVE", "url": "https://<URL_REAL_LATA_PLATA>"}
    ],
    "references": [
      "https://<URL_REF_1>",
      "https://<URL_REF_2>"
    ],
    "callback_url": "https://webhook.site/<id>"
  }'
```

**Tip:** Usa `https://webhook.site` para capturar el callback durante el test sin necesidad de tener el endpoint real listo todavia.

### Paso D — Validacion creativa
4. Cuando termine (~3-5 min), revisar:
   - Las 3 imagenes generadas (URLs en la respuesta o en `webhook.site`)
   - Los 3 videos generados
   - Si los productos se respetan, si las refs guian bien el estilo, si los videos son coherentes

### Paso E — Activar y registrar en plataforma
5. Si todo se ve bien → activar workflow (toggle "Active" arriba a la derecha)
6. Tomar la URL prod del webhook: `https://ardeagency.app.n8n.cloud/webhook/ignis-hero-ingredientes`
7. Crear row en `content_flows` + `flow_modules` apuntando a esa URL en `webhook_url_prod`
8. Ya queda disponible en Studio para todos los clientes

---

## 4) Costo aproximado por ejecucion

Datos de pricing kie.ai (mayo 2026):

| Operacion | Cantidad | Costo unitario aprox | Subtotal |
|---|---|---|---|
| NanoBanana Pro 2K | 3 imagenes | ~$0.04 | $0.12 |
| Kling 3.0 Pro video 5s | 3 videos | ~$0.20 | $0.60 |
| n8n execution time | ~5 min | n8n cloud incluido en plan | $0 |
| **TOTAL por ejecucion** | | | **~$0.72 USD** |

Convertido a creditos (1 cred = $1 USD): **~0.72 creditos**. Con markup recomendado de 10x: **cobrar 8 creditos al cliente** (margen para cubrir n8n, ai-engine, y ganancia operativa).

---

## 5) Limitaciones conocidas y deuda

| # | Tema | Severidad | Plan |
|---|---|---|---|
| 1 | Si una de las 3 NanoBanana falla, Promise.all aborta todas. No hay retry por imagen individual. | Media | Cambiar a `Promise.allSettled` con retry individual en V2 |
| 2 | No persistimos en Supabase Storage; mandamos solo `external_url` de kie.ai (URL temporal). | Media | Agregar paso de download + upload despues de polling, o usar `kie-output-persist` |
| 3 | Prompts default hardcodeados para 3 productos IGNIS. Si llegan productos con otros nombres, usa template generico. | Baja | Mover prompts a tabla `flow_prompt_templates` por brand_container |
| 4 | n8n cloud Pro tiene cap de 5min por nodo. Si Kling demora mas de 6min, falla por timeout. | Baja | Romper en 2 ejecuciones async via webhook-callback chain |
| 5 | Sin manejo de saldo insuficiente kie.ai. Si KIE devuelve 402, el flow falla con error generico. | Baja | Capturar codigo 402 especificamente y devolver mensaje claro al cliente |

---

## 6) Siguiente paso

Cuando IGNIS este validado en produccion (ejecutandose desde Studio con tracking de creditos OK), arrancamos la traduccion del segundo flow: `papermate/papermate_master_back_to_school_v7` (140 nodos ComfyUI). Estructura sera similar pero mas larga, con:

- 14 imagenes NanoBanana (no 3)
- 10 imagenes GPTImage2_I2I (mezcla con i2i)
- 1 video Seedance2 (no Kling)
- 11 LoadImage de personajes/refs (no 5)

Plan de traduccion estimado: ~3-4 horas de trabajo dev.
