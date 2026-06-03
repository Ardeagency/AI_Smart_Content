# Discovery — Product Feature Ads (estructura) + Saul flows (creatividad)

**Fecha:** 2026-05-25
**Estado:** Discovery. NO se ha escrito codigo todavia. Documento para alinear arquitectura antes de construir.

Este documento sintetiza dos analisis paralelos:

- Parte 1: Anatomia tecnica del flow **Product Feature Ads (v37)** que esta corriendo en produccion. Es el patron canonico que cualquier flow nuevo debe seguir.
- Parte 2: Riqueza creativa del flow **IGNIS cat01_hero_ingredientes** que Saul entrego en `flows_vera`. Es el ADN creativo que tenemos que preservar.
- Parte 3: La sintesis. Como combinar (1) + (2) en el flow nuevo.

---

## PARTE 1 — Anatomia de Product Feature Ads (la estructura correcta)

### 1.1 Vista general

| Aspecto | Valor |
|---|---|
| Total nodos | 37 |
| Nodos LLM agent | 4 (Analista, Director, Copy, Visual Scenario) |
| Modelos OpenAI | 5 instancias (cada agent tiene su LLM) |
| Tools externos | SerpAPI (research) + Vector Store Supabase (creative knowledge) |
| Output parsers | 7 structured output parsers (deterministico) |
| HTTP requests | 5 (Nanobanana create, Get status, Dowload, Subir-adjunto, Ingest flow output) |
| Webhook path | `9d928b10-d691-49c1-a453-9f6d05ad1f28` |
| Routing logic | `Switch` por `composition_mode` (individual vs grouped) |

### 1.2 Pipeline logico (orden de ejecucion)

```
[Webhook]
   ↓ recibe body completo
[Switch] composition_mode
   ↓
[Analista de Tendencias] (LLM + SerpAPI)
   ↓ output: { trend_name, trend_category, composition_pattern, ... }
[USER_PROMPT_DIRECTOR] (set var)
   ↓
[Director Creativo] (LLM)
   ↓ output: { preserved_trend_elements, brand_flavor_applied, copy_brief }
[Creative Copy Director] (LLM)
   ↓ output: { headline, subline, typography_notes }
[SCENE DIRECTION BRIEF] (set var)
   ↓
[Visual Scenario Director1] (LLM + Vector Store Supabase RAG)
   ↓ output: { visual_prompt }
[PROMPT] (set var)
   ↓
[Nanobanana PRO] (HTTP POST kie.ai)
   ↓ returns taskId
[Edit Fields1] → [If state==success?]
   ↓ no
[Wait 30s] → [Get recordInfo] → back to If
   ↓ si
[url] (set image URL)
   ↓
[Dowload] (HTTP GET image)
   ↓
[Subir-adjunto] (HTTP POST Supabase Storage)
   ↓
[Ingest flow output] (HTTP POST callback)
```

### 1.3 El payload que recibe el webhook

Lo que la plataforma envia (esto es **lo que la BD construye** desde `flow_schedules`, `brand_containers`, `products`, `personas`, `campaigns`):

```jsonc
{
  "body": {
    "schedule_id": "uuid",
    "entities": [
      {
        "nombre_producto": "AFTERBURN",
        "tipo_producto": "energy_drink",
        "descripcion_producto": "Energia limpia con activacion gradual",
        "beneficios_principales": ["foco sostenido", "no crash"],
        "diferenciadores": ["L-theanine", "cafeina lenta"],
        "images": [{ "image_url": "https://..." }]
      }
      // ... mas productos
    ],
    "persona": {
      "name": "Operadora Premium",
      "description": "...",
      "dolores": [], "deseos": [], "estilo_lenguaje": [],
      "awareness_level": "..."
    },
    "campaign": {
      "nombre_campana": "Lanzamiento Q2",
      "descripcion_interna": "...",
      "angulos_venta": [],
      "cta": "..."
    },
    "brand_identity": {
      "visual_dna": {
        "signature_elements": ["matte black surface", "red rim light", "..."],
        "default_scene_anchor": {
          "surface_options": [], "backdrop": "...",
          "lighting_default": "...", "mood_default": "..."
        },
        "trend_compatibility": {
          "preferred": ["architectural-still-life", "macro"],
          "ok_with_caution": ["lifestyle"],
          "forbidden": ["data-driven", "colorblock"]
        }
      },
      "verbal_dna": {
        "pilares": ["segunda persona singular", "presente", "sentencias cortas"],
        "manifiesto_core": "No todos necesitan energia...",
        "palabras_prohibidas": ["energia explosiva"],
        "palabras_clave": ["pulso", "foco"],
        "verbo_rotacion_pool": ["activar", "encender", "fluir"]
      }
    },
    "brand_colors": [
      { "color_role": "primary", "hex_value": "#FF0000" }
    ],
    "brand_fonts": [
      { "font_usage": "headline", "font_family": "..." }
    ],
    "schedule_config": {
      "aspect_ratio": "1:1",
      "composition_mode": "individual",
      "production_count": 1,
      "production_specifications": "..."
    },
    "meta": {
      "language": "es",
      "trend_category_lock": null
    },
    "previous_trends": ["macro", "architectural-still-life"]
  }
}
```

**Observacion clave:** la plataforma le pasa al flow **todo el contexto del cliente** (brand DNA, persona, campaign, colores, fonts, productos con imagenes). El flow NO conoce ninguna marca por nombre. Es un motor generico.

### 1.4 La cadena de 4 agents LLM (la pieza creativa)

Esta es la parte mas potente. Cada agent tiene rol claro y output estructurado:

#### Agent 1: Analista de Tendencias

- **Rol:** Identificar el **trend visual estructural** ganador en publicidad premium 2024-2026
- **Inputs:** producto, persona, campaign, aspect_ratio, trend_category_lock, previous_trends
- **Tools:** SerpAPI para investigar campañas reales recientes
- **Output JSON:**
  ```jsonc
  {
    "trend_name": "Architectural still-life on real surface with oversized headline",
    "trend_category": "architectural-still-life",
    "composition_pattern": "Three cans on a single real material surface...",
    "typography_treatment": "Single oversized headline cropped at top frame edge...",
    "text_blocks_count": 1,
    "chips_or_badges": [],
    "numbered_specs": false,
    "secondary_card": false,
    "background_treatment": "real surface — single material",
    "camera_approach": "Eye-level, 50mm, shallow-medium DOF",
    "key_visual_elements": [...]
  }
  ```
- **Reglas absolutas:**
  - STRUCTURAL not aesthetic (NO mood adjectives)
  - "Photography first, layout second"
  - Restraint is premium (default: solo headline)
  - Rotation: pickear categorias NO en `previous_trends`
  - Si `trend_category_lock` → usar esa categoria forzosamente

#### Agent 2: Director Creativo

- **Rol:** Combinar **trend (1) + brand DNA (2) = result (3)**. NO reescribir el trend, NO ignorar el brand.
- **Inputs:** output del Analista + brand_identity completo + persona + campaign
- **Output JSON:**
  ```jsonc
  {
    "preserved_trend_elements": [...],  // que del trend se conserva
    "brand_flavor_applied": {
      "signature_elements_used": [...],
      "color_palette": [...],
      "lighting_adjustment": "...",
      "trend_compatibility_status": "preferred|ok_with_caution|forbidden"
    },
    "copy_brief": {
      "tone": "...",
      "verbo_pool": [...],   // del verbal_dna.verbo_rotacion_pool
      "manifiesto_use": "verbatim|do_not_use"
    },
    "final_visual_direction": "..."
  }
  ```
- **Reglas absolutas:**
  - Lee `visual_dna.signature_elements` y aplicalos como base layer
  - Si `visual_dna.default_scene_anchor` y persona+campaign son null → usa el anchor
  - `visual_dna.trend_compatibility` filtra: preferred OK, ok_with_caution agrega constraint, forbidden escala alerta al Visual Director
  - Pasa `verbal_dna.verbo_rotacion_pool` al Copy Director

#### Agent 3: Creative Copy Director

- **Rol:** Generar **headline + subline + typography_notes** que respetan el brand verbal
- **Inputs:** output del Director + verbal_dna + persona + campaign + brand_colors + brand_fonts
- **Output JSON:** `{ headline, subline, typography_notes }`
- **6 hard laws absolutas:**
  1. **Language**: 100% en `body.meta.language` (chips traducidos, NO "DEEP WORK 3+H" si language=es)
  2. **verbal_dna.pilares**: todos aplicados (segunda persona, presente, etc.)
  3. **manifiesto_core**: verbatim o NO usar (nunca splice/reorder)
  4. **No warning-label chips**: ni contenido ("NO CRASH") ni idiom visual (red-outlined pill)
  5. **No-CTA**: nunca "Descubre", "Try", "Buy" — la headline ES la llamada
  6. **Restraint**: si `text_blocks_count=1` → solo headline, sin sub/chips/cards

#### Agent 4: Visual Scenario Director

- **Rol:** Producir el **prompt final para NanoBanana** con 9 secciones obligatorias
- **Inputs:** trend + brand adaptation + copy + scene_brief + RAG (Vector Store Supabase)
- **Tools:** `creative_knowledge_retriever` (RAG sobre 68+ chunks de design library)
- **Proceso obligatorio:**
  1. Read full creative chain
  2. **Call RAG tool 1-3 veces**:
     - Call 1 (mandatory): "lighting preset for [category] [atmosphere]"
     - Call 2 (mandatory): "camera setup for [product_role] [framing_intent]"
     - Call 3 (optional): "composition for [product_count]"
     - Call 4 (optional): "color palette for [atmosphere]"
  3. Apply retrieved + 7 senior design principles
  4. Output ONE NanoBanana prompt
- **Output JSON:** `{ "visual_prompt": "..." }`

### 1.5 El polling pattern

n8n no tiene "esperar a que un job externo termine" nativo. PFA implementa polling asi:

```
[Nanobanana PRO] → returns { taskId }
   ↓
[Edit Fields1] (set var con taskId + counter)
   ↓
[If state == success?]
   ├─ no  →  [Wait 30s]  →  [Get recordInfo]  →  [If state==success?] (loop)
   └─ si  →  continua flow
```

Esto consume tiempo de ejecucion en n8n cloud (n8n cobra por minutos), pero es el patron mas robusto. Para acortarlo se puede aumentar `delay` o usar callbacks de kie.ai (mas complejo).

### 1.6 La descarga y persistencia

```
url (set image_url) → Dowload (HTTP GET con responseFormat=file)
                    → Subir-adjunto (HTTP POST Supabase Storage)
                    → Ingest flow output (HTTP POST callback a la plataforma)
```

**Nota:** `Subir-adjunto` sube el archivo a `production-outputs` bucket. `Ingest flow output` notifica a la plataforma con `{ storage_path, runs_outputs row data }`.

### 1.7 Que hace PFA bien (que el flow IGNIS de Saul no hace)

| Capacidad | PFA | Saul (ComfyUI) |
|---|---|---|
| Prompt construido por LLM en cadena | Si (4 agents) | No (prompts hardcoded) |
| Brand DNA como input | Si | No (especifico de IGNIS) |
| Persona y campaign aware | Si | No |
| RAG sobre biblioteca creativa | Si (Vector Store) | No |
| Rotation logic | Si (`previous_trends`) | No |
| Multi-tenant | Si | No |
| Output structured/parseable | Si (Output Parsers) | No (strings libres) |
| Reusable cross-marca | Si | No |
| Hard laws verbales por marca | Si | No |
| Trend research en tiempo real | Si (SerpAPI) | No |
| Manejo de errores estructurado | Si | No |

---

## PARTE 2 — Concepto creativo del flow IGNIS Saul (la riqueza que falta)

PFA es estructuralmente perfecto pero **NO TIENE VIDEO**, **NO TIENE referencias visuales como guidance**, y le faltan varias decisiones creativas finas que Saul si tiene en su flow.

### 2.1 Visualizacion: el flow como "zonas espaciales"

Saul piensa el flow como **un escenario fisico con zonas**:

```
[Zona A — izquierda]    [Zona C — centro]      [Zona D — derecha]
PRODUCTOS               GENERACION IMAGEN      GENERACION VIDEO
3 LoadImage             3 NanoBanana           3 Kling 3.0
                            ↑
[Zona B — abajo]            |
REFERENCIAS VISUALES   ─────┘
2 LoadImage
```

Esta organizacion espacial **es UX creativa**, no solo decorativa. El operador entiende donde mete cada cosa.

### 2.2 El sistema **Variante-as-Personalidad**

Cada variante tiene una identidad simbolica completa:

| Variante | Color base | Personalidad | Tagline | Ingredientes simbolicos | Movimiento camara |
|---|---|---|---|---|---|
| **AFTERBURN** | Rojo | Energia | "Stay In Motion" | Fresas, cerezas, grosellas rojas, frambuesas, granada | Push-in 50mm + gota rodando + hielo brillando |
| **BLACK CORE** | Negro mate | Poder | "Focus Is Power" | Moras, cerezas negras, ciruelas oscuras, arandanos, cafe | Dolly in 85mm ultra lento + vapor oscuro + pulso de luz roja |
| **OVERDRIVE** | Plata metalico | Velocidad | "Move Faster Than The Market" | Naranja, kumquat, naranja sanguina, menta, limon, jengibre | Orbit/arc 15 grados + shimmer metalico + reflections dancing |

Esta tabla **no esta hardcoded en el JSON** — esta documentada en las Notes para el operador. Pero es el ADN del flow. Cada variante es una historia coherente: color → ingrediente → mood → movimiento.

### 2.3 Anatomia del prompt NanoBanana (9 secciones separadas por `---`)

Saul construye el prompt como un **brief tecnico de fotografia comercial**, no como una descripcion libre:

```
HERO PRODUCT SHOT — [BRAND VARIANT] ([atributos visuales]).
PRODUCT LOCK: preserve EXACT [geometria, label, logo, finish]. Do not invent...
---
SCENE: [composicion, ingredientes, condensacion, ice]
---
BACKGROUND: [tipo gradiente, color matching, backlight]
---
LIGHTING: [direccion, dureza, ratio, fill]
---
CAMERA: [lens, angulo, DOF, focus point]
---
COLOR GRADE: [referencia film/marca, tonal feel]
---
RENDER: [4K, photoreal, hyperrealistic, etc]
---
NEGATIVE: [lista exhaustiva de anti-patterns]
```

**Cada seccion es indivisible y tiene proposito:**
- `PRODUCT LOCK` antes que cualquier escena → no inventar branding
- `SCENE` define la narrativa visual
- `BACKGROUND` siempre monocromatico matching color (consistencia de marca)
- `LIGHTING` siempre side+rim+fill (estandar fotografico)
- `CAMERA` por default 85mm f/1.4 hero perspective
- `COLOR GRADE` referenciado a Hasselblad/Portra (estandar comercial)
- `NEGATIVE` es CAFE largo: plastic skin, generic orange-teal grading, AI-generated look, etc.

### 2.4 Anatomia del prompt Kling (video)

El prompt de Kling tiene su propia estructura:

```
Cinematic product hero video. 
Use the provided first frame as IMMUTABLE visual anchor: preserve EXACTLY 
the [brand variant], its label, logo, condensation, [props], [bg], lighting 
and composition. 

Camera: [movimiento camara] on a [lens] toward the [target], [intensidad], 
smooth and steady. 

Action: [accion principal], [accion secundaria sutil], [shimmer/glow detail]. 

Background: completely static, no changes. 
Lighting shifts subtly as camera moves, creating [efecto]. 

Mood: [adjetivos]. 

Technical: 24fps, natural motion blur, no morphing, no warping, no plastic 
textures, no extra objects appearing, no text changes. 
The can does NOT move, rotate or change in any way.
```

**El concepto clave:** la imagen hero es **IMMUTABLE visual anchor**. El video solo agrega micro-movimientos (gota, vapor, shimmer) pero el can NO se mueve. Esto evita el "morphing-AI look" que tipicamente sale de modelos i2v.

### 2.5 Sistema de referencias visuales (el ImageBatch)

Saul concatena **5 imagenes** como input para cada NanoBanana:

```
3 productos (AFTERBURN.jpg, BLACK CORE.jpg, OVERDRIVE.jpg)
   +
2 references (reference_style_01.jpg, reference_style_02.jpg)
   =
5 imagenes concatenadas como input visual
```

Las references son **MOOD BOARDS**, no contenido a reproducir. Guian el estilo (lighting, color grade, composition) pero NO la geometria. NanoBanana las usa como "estilo de referencia".

PFA no tiene este patron. PFA solo manda producto. Esto es algo que el flow nuevo debe heredar de Saul.

### 2.6 Estandar de movimientos de camara "ARDE"

Saul lista los movimientos como un vocabulario fijo del equipo creativo:

| Movimiento | Uso |
|---|---|
| **Push-in** | Acercamiento intenso, enfoque en producto |
| **Dolly in** | Acercamiento suave, elegante |
| **Orbit/arc** | Rotacion parcial, descubrimiento |
| **Static + micro-mov** | Estabilidad con vida sutil |
| **Crane up** | Revelacion dramatica |

Y un catalogo de **acciones para hero bebidas**:
- Gota de condensacion rodando
- Vapor/frio subiendo
- Reflejo de luz bailando
- Hielo brillando
- Fruta glistening
- Mint leaf micro-movimiento

Esto es **un sistema de design language** que vale la pena codificar en la biblioteca creativa.

### 2.7 Placeholders editables `[VARIANTE]`, `[INGREDIENTES]`, `[COLOR_FONDO]`

Saul ya tenia la intuicion correcta de tener placeholders. Pero los implementa como markers de texto que el operador edita manualmente. El flow nuevo los va a tener como **variables reales del payload**, sustituidas por la cadena LLM en tiempo real.

---

## PARTE 3 — La sintesis: el flow nuevo

### 3.1 Concepto general

```
NOMBRE:     Hero Cinematografico Multi-Variante (Imagen + Video)
TIPO:       generico, reusable cross-marca (IGNIS, Papermate, cualquier brand)
INPUTS:     payload identico a PFA + extension de video
OUTPUT:     N imagenes hero + N videos 5s (N = 1-5, configurable)
ARQUITECTURA: cadena PFA (4 agents) + 1 agent nuevo de movimiento de camara
```

### 3.2 Cadena LLM extendida (5 agents)

```
[Analista de Tendencias]         ← reusa PFA verbatim
        ↓
[Director Creativo]               ← reusa PFA verbatim
        ↓
[Creative Copy Director]          ← reusa PFA verbatim (opcional, segun trend)
        ↓
[Visual Scenario Director]        ← reusa PFA + agrega "9 secciones" estilo Saul
        ↓ visual_prompt (imagen)
[Imagen NanoBanana] → image_url
        ↓
[Motion Director — NUEVO]         ← agente nuevo, hereda concepto Saul
        ↓ video_prompt (con first_frame_lock)
[Kling 3.0] → video_url
```

### 3.3 Motion Director (el agente nuevo)

**Rol:** Recibir la imagen hero generada + el contexto del producto/brand, y producir el prompt Kling 5s.

**Inputs:**
- `image_url` (la imagen recien generada por NanoBanana)
- `product_info` (variante, personalidad)
- `brand_movement_pool` (del brand_container.visual_dna — extension nueva)
- `default_actions` (catalogo Arde de acciones para producto/bebidas/cosmetica/etc)

**Output JSON:**
```jsonc
{
  "video_prompt": "Cinematic product hero video. Use first frame as IMMUTABLE anchor...",
  "movement_used": "push-in",          // del vocabulario Arde
  "actions_used": ["condensation drop rolling", "ice glistening"],
  "preserved_elements": ["can geometry", "label", "logo", "bg gradient"]
}
```

**System message (boceto):**
```
Eres el Senior Motion Director para video publicitario premium.

Tu solo trabajo: tomar UNA imagen hero y producir un prompt de video 5s 
que preserve la imagen como IMMUTABLE anchor y agregue movimiento minimo 
con vida.

REGLAS ABSOLUTAS:
1. El producto NO se mueve, NO rota, NO cambia geometria
2. Solo micro-movimientos: condensation, vapor, shimmer, light dance, 
   fruit glistening
3. Camera move maximo 5-10% del frame
4. Background ESTATICO
5. Mood adjectives prohibidos, descripciones tecnicas concretas
6. SIEMPRE incluir "Technical: 24fps, no morphing, no warping, no plastic 
   textures, no extra objects appearing"

VOCABULARIO ARDE (movements):
- push-in: acercamiento intenso
- dolly in: acercamiento suave  
- orbit/arc: rotacion parcial 15deg
- static + micro-mov: estabilidad con vida
- crane up: revelacion dramatica

VOCABULARIO ARDE (actions para bebidas):
- condensation drop rolling
- cold vapor rising
- light reflection dancing
- ice fragments glistening
- fruit surface shimmer
- mint leaf micro-movement

SELECCION: mapea PERSONALIDAD del producto → movement + action:
- ENERGIA   → push-in + drop rolling + ice
- PODER     → dolly in + dark vapor + red pulse  
- VELOCIDAD → orbit + metallic shimmer
- ELEGANCIA → static + micro-mov + soft light dance
```

### 3.4 Extensiones al payload del webhook

Lo que PFA recibe + lo nuevo para video:

```jsonc
{
  "body": {
    // ... (todo PFA) ...
    
    // NUEVO: configuracion de video
    "video_config": {
      "enabled": true,
      "duration": 5,
      "model": "kling-3.0/video",
      "mode": "pro",
      "aspect_ratio": "1:1"
    },
    
    // NUEVO: referencias visuales como mood board
    "visual_references": [
      "https://<bucket>/refs/mood_01.jpg",
      "https://<bucket>/refs/mood_02.jpg"
    ],
    
    // NUEVO en brand_identity.visual_dna
    "brand_identity": {
      "visual_dna": {
        // ... existente ...
        
        // NUEVO
        "movement_pool": ["push-in", "dolly in"],
        "action_palette": ["condensation rolling", "ice glistening"],
        "negative_patterns_extended": [
          "morphing AI look", "plastic skin", "warped geometry"
        ]
      }
    }
  }
}
```

### 3.5 Outputs (lo que regresa al callback)

Por cada producto N (cantidad configurable 1-5):

```jsonc
[
  {
    "kind": "image",
    "product_name": "[del input]",
    "variant_personality": "energia | poder | velocidad | ...",  // del agent
    "trend_category": "...",
    "external_url": "https://kie.ai/...",
    "storage_path": "<org>/<flow>/<product>_hero",
    "metadata": {
      "model": "nano-banana-pro",
      "aspect_ratio": "...",
      "resolution": "2K",
      "trend_used": "...",
      "visual_prompt": "...",
      "rag_chunks_used": [...]
    }
  },
  {
    "kind": "video",
    "product_name": "[del input]",
    "external_url": "https://kie.ai/...",
    "storage_path": "<org>/<flow>/<product>_hero_reel",
    "metadata": {
      "model": "kling-3.0/video",
      "duration": 5,
      "first_frame_image_task_id": "...",
      "movement_used": "push-in",
      "actions_used": ["condensation rolling", "ice glistening"],
      "video_prompt": "..."
    }
  }
  // ... x N productos
]
```

### 3.6 Cosas que NO van al flow

Por contraste con lo que hice mal en el primer intento de traduccion ingenua:

| Cosa | Donde NO va | Donde SI va |
|---|---|---|
| Nombre IGNIS | NO en nombre del workflow | En `brand_container.name` del payload |
| Prompts hardcoded de AFTERBURN | NO en codigo del flow | Los genera el Visual Scenario Director con el brand DNA |
| Path `ignis/cat01/...` | NO hardcoded | Se construye en runtime: `<org_slug>/<flow_slug>/<product_slug>` |
| Tagline "Stay In Motion" | NO en codigo | En `brand_identity.verbal_dna` del payload |
| Lista de ingredientes simbolicos | NO en codigo | En `brand_identity.visual_dna.symbol_palette` (extension nueva del schema) o pasa via Director Creativo |

### 3.7 Lo nuevo que hay que codificar

| Pieza | Donde | Esfuerzo |
|---|---|---|
| Motion Director agent | n8n nuevo workflow | 1-2h escribir system message + user prompt + parser |
| Extension del payload con `video_config` | Supabase RPC `rpc_build_flow_context` | 30min |
| Extension de `visual_dna` con `movement_pool`, `action_palette` | Supabase tabla `brand_containers` | 15min migracion |
| Catalogo Arde de movements/actions (RAG chunks) | Vector Store Supabase | 30min crear chunks |
| Extension de `runs_outputs` para video | Ya existe schema unified (vimos en memoria) | 0 |
| Polling de Kling (mas largo que NanoBanana) | n8n workflow (delay 30-45s) | inherente al pattern |

### 3.8 Costo aproximado por ejecucion (3 productos = 3 imagenes + 3 videos)

| Operacion | Cantidad | Costo aprox | Subtotal |
|---|---|---|---|
| LLM agents (5 calls gpt-4o) | 5 | ~$0.04 | $0.20 |
| RAG queries (4 embeddings) | 4 | ~$0.001 | $0.004 |
| NanoBanana Pro 2K | 3 | ~$0.04 | $0.12 |
| Kling 3.0 Pro 5s | 3 | ~$0.20 | $0.60 |
| n8n execution time | ~5 min | incluido | $0 |
| **TOTAL** | | | **~$0.92 USD** |

Con markup 10x → **cobrar ~9-10 creditos al cliente** por ejecucion.

---

## PARTE 4 — Decision pendiente antes de codificar

Antes de escribir el workflow nuevo, hay 3 decisiones que necesito confirmes:

### 4.1 ¿Usamos el mismo `creative_knowledge_retriever` (Vector Store) que PFA?

- **Si:** consistencia entre flows, mejor calidad creativa. **Requiere:** agregar chunks nuevos para video/movement.
- **No:** flow mas simple, sin RAG. Movement Director trabaja solo con system message.

### 4.2 ¿El flow soporta de 1 a 5 productos en una sola ejecucion, o solo 3 fijos?

- **1-5:** maxima flexibilidad, mas complejo (loop dinamico).
- **3 fijos:** mas simple, pero menos flexible (no sirve para flows de 1 producto solo o de 5 variantes).

### 4.3 ¿Generamos siempre imagen + video, o el video es opcional?

- **Siempre:** el flow se vende como "Hero Cinematografico" que incluye video.
- **Opcional:** `body.video_config.enabled = true/false`. Permite ejecutar el flow para solo imagenes (~$0.32 ejecucion) o imagen+video (~$0.92 ejecucion).

---

## PARTE 5 — Cierre

El flow nuevo va a ser:

- **Estructuralmente identico** a Product Feature Ads (mismo patron de 4 agents + polling + ingest)
- **Creativamente enriquecido** con: prompts de 9 secciones (Saul), referencias visuales como mood board (Saul), vocabulario Arde de camera/action (Saul), Motion Director con first-frame lock (Saul), variante-as-personalidad mapeo
- **Multi-tenant nativo** (cualquier brand_container con su visual_dna + verbal_dna funciona)
- **Sin hardcoding** de marcas, productos, o paths especificos

Cuando confirmes las 3 decisiones de la Parte 4, escribo el JSON del workflow + las migraciones de schema necesarias.
