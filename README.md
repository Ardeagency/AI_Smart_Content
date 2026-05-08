# AI Smart Content

**Plataforma de inteligencia comercial y generacion autonoma de contenido.**
Desarrollada por **Arde Agency**.

> La marca que no reacciona en tiempo real, no existe.
> AI Smart Content elimina la latencia entre lo que pasa en el mercado y la respuesta de tu marca.

---

## Que es AI Smart Content

Una arquitectura de **Marca Viva** que integra escucha social profunda, analisis de competencia y creacion instantanea de activos digitales. Opera bajo un ciclo continuo de tres etapas:

1. **Escucha** -- Lectura del mundo en tiempo real: competidores, tendencias, consumidor.
2. **Procesamiento** -- Cruce de inteligencia de mercado con el ADN de la marca (identidad, valores, objetivos).
3. **Manifestacion** -- Generacion automatica de contenido visual, textual y video alineado con la estrategia.

El agente interno **Vera** orquesta todo el ciclo: decide que merece respuesta, ejecuta la produccion y distribuye en los canales digitales del cliente.

---

## Stack tecnologico

| Capa | Tecnologia |
|------|-----------|
| **Frontend** | HTML5 SPA, Vanilla JS (ES6+), CSS bundle, Chart.js |
| **Backend** | Netlify Functions (serverless) |
| **Base de datos** | Supabase (PostgreSQL + RLS + Storage) |
| **AI / LLM** | OpenAI API (texto + prompts cinematicos) |
| **Video** | KIE API (generacion de video) |
| **Integraciones** | Meta Graph API (Facebook + Instagram), Google Analytics 4, YouTube Data API |
| **Auth** | Supabase Auth + OAuth (Meta, Google) |
| **Deploy** | Netlify |

---

## Estructura del proyecto

```
AI Smart Content/
|
|-- index.html              # Entry point (SPA)
|-- netlify.toml            # Configuracion de deploy y funciones
|
|-- css/
|   `-- bundle.css          # Stylesheet unico de la plataforma
|
|-- js/
|   |-- app.js              # Orquestador principal
|   |-- app-loader.js       # Inicializacion y entrada animada
|   |-- router.js           # SPA router (lazy loading por ruta)
|   |-- components/
|   |   `-- Navigation.js   # Navegacion persistente
|   |-- services/
|   |   |-- AppState.js     # Estado global
|   |   |-- AuthService.js  # Autenticacion
|   |   |-- SupabaseService.js
|   |   |-- OrgBrandTheme.js
|   |   `-- FlowWebhookService.js
|   |-- views/              # Vistas de la aplicacion (~20 vistas)
|   |-- utils/              # ErrorHandler, Performance
|   `-- (modulos auxiliares)
|
|-- functions/              # Netlify serverless functions
|   |-- api-ai-*.js         # Endpoints de IA (chat, acciones, contexto)
|   |-- api-brand-*.js      # Analytics y sync de marca (Meta, GA4, YouTube)
|   |-- api-insights-*.js   # Dashboards de insights
|   |-- api-integrations-*  # OAuth flows (Facebook, Google)
|   |-- api-webhooks-*.js   # Webhooks de Meta
|   |-- kie-*.js            # Produccion de video (KIE)
|   |-- openai-*.js         # Generacion de prompts (texto + cine)
|   `-- lib/                # Utilidades compartidas
|
|-- templates/              # HTML templates por vista (~18 templates)
|-- SQL/
|   |-- schema.sql          # Schema maestro de la base de datos
|   |-- security_RLS.sql    # Politicas RLS (re-aplicable)
|   |-- storage_buckets.sql # Configuracion de buckets de storage
|   |-- migrations/         # Migraciones aplicadas (referencia)
|   |-- functions/          # RPCs activas (products, inputs, living)
|   `-- seeds/              # Seeds de datos (templates UI)
|-- memory-banks/           # Bancos de memoria de Vera (identidad, estrategia, datos)
|-- recursos/               # Todos los recursos visuales
|   |-- logos/              # Variantes del logo AI Smart Content
|   |-- vera/               # Identidad visual de Vera
|   |-- assets/             # Assets graficos de marca
|   |-- banners/            # Banners SVG para landing
|   |-- icons/              # Iconos de interfaz (SVG)
|   |-- favicons/           # Favicons SVG (claro/oscuro)
|   |-- fondos/             # Fondos e imagenes de fondo
|   `-- source/             # Archivos fuente Illustrator (.ai)
`-- docs/                   # Documentacion tecnica y specs de producto
```

---

## Documentacion

Toda la documentacion tecnica y de producto esta en `docs/`:

### Arquitectura de plataforma (carpeta `docs/platform/`)
Documentacion viva, mantenida en cada cambio estructural:
- `01-overview.md` -- Vision general (empezar aqui)
- `02-architecture.md` -- Arquitectura completa
- `03-database.md` -- Schema, RLS, mat-views, RPCs
- `04-ai-engine.md` -- Control plane Node + Python analyzer
- `05-frontend.md` -- SPA vanilla + servicios + vistas
- `06-data-flows.md` -- Flujos de datos sensor->signal->mision->UI
- `07-vera.md` -- Agente Vera (chat + strategist + outcomes)
- `08-deployment.md` -- Hetzner, Netlify, Cloudflared
- `09-current-state.md` -- Snapshot del estado actual
- `10-extending.md` -- Como anadir features nuevas
- `sensor-types-catalog.md` -- 13 sensores documentados
- `ESTADO_EXPANDIDO_2026-05-05.md` -- Snapshot expandido (referencia historica)

### Sprint y tareas activas (carpeta `docs/task/`)
- `INDEX.md` -- Tracker de todas las tareas activas (severidad + owner)
- `SPRINT-FRONTEND-100-2026-05-06.md` -- Sprint critico actual
- `AUDIT-001-frontend-vs-backend-2026-05-05.md` -- Auditoria frontend vs backend
- `BUG-*.md`, `FEAT-*.md`, `OPS-*.md`, `DATA-*.md` -- Tareas individuales

### Integraciones y APIs
- `webhook-meta-setup.md` -- Configuracion webhooks Meta
- `KIE-VIDEO-API.md` -- API de KIE (Kling 3.0 video)

### Specs de Dashboards
- `DASHBOARD-MI-MARCA.txt` -- Spec dashboard 1
- `DASHBOARD-MI-COMPETENCIA.txt` -- Spec dashboard 2
- `DASHBOARD-TENDENCIAS.txt` -- Spec dashboard 3

### Schedules y flows
- `AUTOMATED_FLOW_SCHEDULE_INPUTS.md` -- Schema de inputs para flows programados

---

## Vera -- El agente inteligente

Vera es la IA que habita la plataforma. No es un chatbot: es un agente estrategico con identidad propia que analiza, decide y produce.

Sus bancos de memoria (`memory-banks/`) definen:
- **Identidad** -- Voz, estilo, principios
- **Brand Thinking** -- Como analiza marcas como organismos vivos
- **Content Strategy** -- Patrones de estrategia de contenido
- **Data Protocol** -- Estandares de manejo de datos
- **Platform Knowledge** -- Conocimiento de las capacidades de la plataforma

---

## Variables de entorno

El proyecto requiere las siguientes variables configuradas en Netlify:

| Variable | Servicio |
|----------|---------|
| `SUPABASE_URL` | Supabase |
| `SUPABASE_SERVICE_KEY` | Supabase (service role) |
| `OPENAI_API_KEY` | OpenAI |
| `KIE_API_KEY` | KIE Video |
| `META_APP_ID` | Meta / Facebook |
| `META_APP_SECRET` | Meta / Facebook |
| `META_VERIFY_TOKEN` | Meta Webhooks |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |

> Consulta `SECURITY.md` para la politica completa de seguridad y secretos.

---

## Desarrollo local

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Levantar el servidor de desarrollo
netlify dev
```

El SPA se sirve desde `index.html`. Las funciones serverless se ejecutan desde `functions/`.

---

## Deploy

El proyecto se despliega automaticamente en **Netlify**. La configuracion esta en `netlify.toml`.

- **Produccion:** Push a la rama principal
- **Dominio:** aismartcontent.io

---

*Arde Agency -- Hacemos que las marcas ardan.*
