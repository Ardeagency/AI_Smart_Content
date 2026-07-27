# 01 — Mapa del sistema

Qué pieza es cada cosa, dónde vive y de qué es responsable. Si algo de esta
bitácora no se entiende, probablemente falta leer este capítulo primero.

---

## 1. Las cinco piezas

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Landing** | Sitio público (marketing, legales, contacto de ventas) | `aismartcontent.io` — editado en **Framer**, NO está en este repo |
| **Consola** | La aplicación: login, dashboards, Studio, Vera, marcas, integraciones | `console.aismartcontent.io` — este repo, desplegado en Netlify desde `main` |
| **ai-engine** | El motor: scrapers, sensores, populators, tools, puente con Supabase | VM Hetzner, `ssh ai-engine`, `/root/ai-engine`, systemd `ai-engine.service` |
| **Vera** | El cerebro: agente LLM (OpenClaw) que percibe, decide y ejecuta | Corre en el ai-engine (chat) y en **org-servers** dedicados por organización (modo autónomo) |
| **Supabase** | La base de datos y el contrato entre todas las piezas | Proyecto `tsdpbqcwjckbfsdqacam` |

Piezas de apoyo:

- **content-flows** — servidor Hetzner separado (CPX41) para flujos que necesitan
  servidor propio: pool de workers ComfyUI + dispatcher FastAPI. Deliberadamente
  aislado del `ai-engine` de producción para no compartir su punto único de fallo.
- **Cloudflare R2** — donde vive toda la media de la plataforma (`media.aismartcontent.io`).
- **n8n Cloud** — flujos de producción de contenido que la consola dispara por webhook.

---

## 2. Separación de responsabilidades

> *"Vera es el cerebro. ai-engine es el cuerpo. Sin Vera, ai-engine no sabe qué hacer.
> Sin ai-engine, Vera no tiene manos."*
> — Protocolo técnico v3 (2026-05-21)

- **Vera** percibe, triangula, decide y dirige. Nadie le dice qué hacer.
- **ai-engine** ejecuta, conecta y reporta. Es el **único puente** con Supabase,
  Apify, los flujos y las notificaciones. No piensa: ejecuta órdenes con precisión,
  validándolas antes.
- **La consola** es la superficie: muestra la inteligencia de Vera y ofrece los
  botones donde el humano decide.

Invariante de seguridad que sostiene el diseño: **el org-server de Vera corre sin
credenciales de base de datos.** Vera pide datos con *tools*; el ai-engine las
resuelve y devuelve sólo lo que corresponde a esa organización.

---

## 3. Vocabulario del producto

Esto no es cosmética: usar el término equivocado ha causado errores de modelado
repetidos. **AI Smart Content no clona las plataformas externas, las orquesta**, así
que usa su propio vocabulario.

| Se dice | NO se dice | Qué es en la base |
|---|---|---|
| **Marca** | — | `organizations` — la marca real (Coca-Cola, WAKEUP, IGNIS) |
| **Mercado** | "sub-marca" | `brand_containers` — la misma marca operando en otro país/idioma/tono |
| **Creativo** | "Anuncio" | `campaign_ads` — la pieza producida; el anuncio real vive en la plataforma externa |
| **Vera** | "la IA" | El copy de producto siempre atribuye la inteligencia a Vera |
| **Mercado asociado** | "Marca asociada" | El selector de `brand_container` en la UI |

Reglas de modelo derivadas:

- `products`, `services`, `brand_entities` son **de la organización** y se comparten
  entre todos sus mercados. Que dos mercados devuelvan los mismos productos **no es
  un bug**, es el diseño.
- Lo que **sí** cambia por mercado: `mercado_objetivo`, `idiomas_contenido`,
  `palabras_prohibidas`, `nicho_core`, `sub_nichos`, `palabras_clave`,
  `audience_personas`, `campaign_briefs`, `brand_narrative_pillars`, `brand_posts`.
- Existen **dos tipos de campaña** con propósitos distintos: las **reales**
  (sincronizadas de la plataforma, sirven para métricas y análisis) y las
  **conceptuales** (dirigen la producción creativa dentro de la plataforma).

Los nombres técnicos de tablas y claves pueden conservar el término histórico
(`brand_containers`, `node_type: 'ad'`); **toda la UI, los docs y el copy usan el
vocabulario del producto.**

---

## 4. Organizaciones de referencia

- **IGNIS** (`a1000000-0000-0000-0000-000000000001`) — marca **ficticia**, sin producto
  real ni cuentas oficiales. Es la organización vitrina/demo de la plataforma y el
  banco de pruebas de casi todo lo construido. Nada de lo que se le publique es real.
- **WAKEUP** (`e2477719-d65e-422a-a5aa-3473d6536060`) — cliente real. Es la
  organización con datos vivos sobre la que se validan los sensores, el monitoreo,
  las lecturas de Vera y los océanos azules.

---

## 5. Despliegue y ramas

- **Repo:** `github.com/Ardeagency/AI_Smart_Content`, rama `main`.
- **Push a `main` = despliegue a producción** en `console.aismartcontent.io` (Netlify).
  No hay paso manual entre commit y producción.
- **Consecuencia crítica:** un push envía *todos* los commits locales pendientes,
  incluidos los de otra sesión de trabajo. Antes de empujar hay que revisar
  `git log origin/main..HEAD`.
- El repo vive en iCloud y **puede tener otra sesión editando en paralelo**. Práctica
  obligatoria: revisar `git log --oneline -3` antes de commitear y **preparar sólo los
  archivos propios por nombre** — `git add -A` ya arrastró trabajo ajeno y rompió un
  despliegue.
- La carpeta `SQL/` está completa en `.gitignore` **por diseño**: las migraciones se
  aplican a Supabase por la Management API y no se versionan aquí.

**Integración continua** (`.github/workflows/ci.yml`, 2 jobs):

- `lint` — `eslint . --max-warnings N`, un **ratchet de deuda**: falla si un cambio
  *agrega* warnings. Para arreglarlo hay que reducir warnings, nunca subir el tope.
- `smoke` — `vitest run`: endpoints del ai-engine (health, chat 401, HMAC de webhooks)
  y RLS (que `anon` no pueda leer tablas protegidas). Node 22 en CI.

GitHub sólo notifica los fallos: si no llega correo, el run salió verde. Un correo
"Run failed" repetido en cada commit suele significar que el ratchet se cruzó hace
días, no que lo rompió el último push.

---

## 6. Servidores

| Servidor | Rol | Notas |
|---|---|---|
| `ai-engine` (Hetzner CCX33) | Motor de producción: Express `:3000`, expuesto sólo por túnel Cloudflare (`api.aismartcontent.io`) | Corre bajo **systemd**, no PM2. UFW + fail2ban activos |
| `content-flows` (Hetzner CPX41) | Workers ComfyUI + dispatcher FastAPI para flujos de generación | Separado a propósito del SPOF de producción |
| org-servers (`vera-<org>-…`) | Runtime LLM de Vera por organización | VMs desechables; se registran en `openclaw_instances` |

El `ai-engine` es **multi-tenant**: sirve a todas las organizaciones. Cualquier
sesión de scraping compartida por plataforma es un punto único de fallo — si la
cuenta se bloquea, *todos* los tenants pierden esa red a la vez.

---

## 7. Regla de oro al tocar el ai-engine

El espejo local `~/ai-engine-mirror` **puede estar desactualizado** frente al
servidor. El servidor es la fuente de verdad operativa; git es la fuente de verdad
del código.

Protocolo: traer el archivo fresco del servidor → editar quirúrgicamente (nunca
sobrescribir archivos enteros) → `node --check` → reiniciar → **diff contra el `.bak`
para confirmar que sólo cambiaron tus líneas** → commitear en el servidor.

Esto no es paranoia: dos sesiones de trabajo concurrentes ya se pisaron mutuamente
y borraron el registro de una herramienta entre la descarga y el despliegue.
