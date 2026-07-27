# 02 — Frontend: la consola

`console.aismartcontent.io`. SPA en JavaScript vanilla, **sin framework y sin build
en desarrollo** (en producción Netlify corre una minificación previa). Los scripts se
cargan crudos y comparten globales `window.X`.

Inventario verificado el **2026-07-27**: 51 vistas en `js/views/` (más 5 carpetas de
mixins), 18 servicios en `js/services/`, 34 módulos CSS en `css/modules/` y 62
funciones Netlify en `functions/`.

---

## 1. Estructura

```
index.html          → carga los scripts en orden; el orden importa (globales compartidos)
js/
  app.js            → router + loader por ruta (decide qué mixins carga cada vista)
  router.js         → navegación SPA
  views/            → 51 vistas; BaseView es la clase madre
    dashboard/      → los 4 tabs del tablero, como mixins del mismo prototipo
    commandcenter/  → Canvas.mixin.js (el lienzo de nodos)
    builder/        → editor de flujos
    brandstorage/   → identidad de marca
  services/         → capa de datos y utilidades transversales
  i18n/             → catálogos de traducción
css/
  bundle.css        → tokens + estilos globales (24 @import aplanados en el build)
  modules/          → 34 módulos; algunos con route-split
functions/          → 62 funciones Netlify (integraciones, KIE, billing, webhooks)
```

**Primitivas de `BaseView`** — la infraestructura buena que hay que usar antes de
inventar: `liveSubscribe` (datos en vivo sin parpadeo), `emptyState` (estado vacío
premium), skeletons, `moveSubnavToHeader`, y el envoltorio de `addEventListener` que
limpia solo al desmontar la vista.

**Capa de datos:** `ApiClient` (con SWR), `SupabaseService`, `ErrorHandler`,
`ErrorLogger`, y un *DataService* por dashboard (`CampanasDataService`,
`CompetenciaDataService`, `TendenciasDataService`, `StrategiaDataService`,
`MonitoringDataService`, `VeraReadingService`).

---

## 2. Los cuatro dashboards

El tablero de la organización tiene cuatro tabs: **Mi Marca**, **Competencia**
(antes "Monitoreo"), **Tendencias** y **Estrategia**. Cada uno es un mixin sobre el
mismo prototipo, así que todos comparten métodos y CSS.

### 2.1 El blanqueo deliberado (2026-07-17)

Desde el commit `ef5ca408` el cuerpo de los 4 tabs **se pinta vacío a propósito**
mientras se rediseña la Lectura de Vera. **No es un bug.** Cada mixin tiene un
corto-circuito en la primera línea de su render que delega en `_renderVeraTabBody()`,
que limpia el contenedor y retorna.

**Consecuencia que cuesta tiempo si no se sabe:** todo el pipeline legacy de los tabs
—sus builders, sus RPCs, sus DataServices— **existe, compila y tiene datos vivos en
la base, pero nunca se ejecuta**. Verificar que una card "está en el código" y que
"su RPC devuelve datos" NO prueba que se vea. Hay que seguir el camino hasta el render.

Para reactivar un tab completo: quitar su corto-circuito. Para revertir el blanqueo
de los cuatro: revertir `ef5ca408`.

### 2.2 La jerarquía (aprobada 2026-07-24)

Los cuatro dashboards se habían creado sin orden. Se investigó (NN/g, Stephen Few) y
se aprobó **una sola columna vertebral, pirámide invertida**, para los cuatro:

1. **Veredicto** — glanceable en 5 segundos, arriba a la izquierda: estado de salud + número titular.
2. **Lectura de Vera** — el porqué: Observación + **Intuición**. Decisión del usuario:
   *liderar con la Intuición* (nivel 2, no cierre) porque la app es un consultor, no un tablero.
3. **Evidencia** — los charts que explican el movimiento.
4. **Desglose** — por plataforma, perfil o producto.
5. **Acción** — piezas concretas y siguientes pasos.

Estado: **piloto hecho en Mi Marca**; falta replicar el reordenamiento completo a los
otros tres tabs.

### 2.3 Mi Marca — `BrandGrid.mixin.js`

Rejilla de cards `glass-black` alimentada por datos crudos de `brand_posts` (sin
clasificador). Cards construidas en 2026-07:

- **Actividad de publicación** — pill de estado, barra de salud 0-100, filtro
  Semana/Mes/Año/Todo y barras apiladas por red.
- **Latidos** — chart *candlestick* de impacto social, sin fondo ni bordes.
- **Salud / Rendimiento por plataforma** — ver §2.6.
- **Tu Algoritmo**, **Audiencias recomendadas**, **Producto destacado**,
  **Publicación destacada**, **Campañas**, **Observaciones**, **Intuición de Vera**.

Las cards de lectura las escribe **Vera**, no el frontend (ver [04-vera](./04-vera.md)).

### 2.4 Competencia — `CompGrid.mixin.js`

Rediseñado el 2026-07-22, gemelo de Mi Marca:

- **Influencia digital** — barras HTML horizontales por perfil competidor (no Chart.js),
  ordenadas por interacciones del periodo.
- **La publicación que más movió** — preview del post ganador con métricas y comentarios reales.
- **Qué hace cada perfil** — tabla escrita por Vera (bloques `perfil_analisis`).
- **Observaciones** — lo destacado de cada perfil en el ciclo (bloques `observacion_perfil`).

Doctrina de esta pantalla:

- **Sólo competencia**: filtra a `competidor_directo` e `indirecto`. Comparar tu
  influencia contra Nike o contra tu propia página no dice nada del campo de batalla.
- **Interacción ≠ reproducción**: el ranking suma likes + comentarios + compartidos +
  guardados. Las reproducciones se muestran pero nunca ordenan — son alcance pasivo.
- **Las ventanas se anclan al último post capturado**, no a `now()`: si la marca lleva
  días sin publicar, "Semana" saldría vacía.

### 2.5 Tendencias y Estrategia

**Tendencias** está casi vacío. Excepciones vivas:

- **Próximas Fechas** — se pinta dentro del cuerpo vacío con un único RPC
  (`dashboard_tendencias_real_world`); si falla, el tab queda como estaba.
- **Océanos azules** (2026-07-23) — demanda del nicho que nadie cubre. Cruza lo que
  la gente busca (`audience_demand_signals`) contra lo que la marca y su competencia
  ya dicen (`trend_topics`); Vera agrupa y juzga con contrato JSON tipado. Reemplazó
  a "Perfiles recomendados", que fue eliminado por completo. Incluye el botón
  **"Trabajarlo"**, que abre Vera con el brief del océano cargado.

**Estrategia** está en blanco: primero hay que decidir qué cards viven ahí.

### 2.6 Reglas de veredicto aprendidas

- **La recencia gatea el veredicto.** El widget de rendimiento por plataforma coronaba
  "MEJOR" a la red con más engagement por post sin mirar actividad — IGNIS marcaba
  Instagram como mejor con 6 semanas sin publicar. Ahora
  `salud = (eng/max)*0.5 + recencia*0.5`, y "MEJOR" sólo se otorga a una red sana **y
  activa**. Patrón reutilizable: cualquier veredicto sobre una métrica *por unidad*
  (eng/post, CPL) debe gatearse por volumen reciente, o premia cuentas muertas.
- **Filtro de plataforma** (2026-06-02): se agregó `p_platforms text[]` a 11 RPCs.
  La columna real es `network`, no `platform`.

---

## 3. Sistema visual

**Dirección: "Glass Noir" — minimalismo premium monocromático.** No degradados de
color saturados: se leen chillones.

- Superficie monocroma; iconos y texto en escala de grises. **Los iconos siempre van
  en blanco.**
- Estado activo = *pill* translúcido elevado, sin color.
- El **degradado dinámico de marca** (`--brand-gradient-dynamic`, construido por
  `OrgBrandTheme` a partir de los `brand_colors` de la organización) es EL acento —
  pero con restricción: filo de 2px, bloom tenue, barra de créditos, borde de botón.
  **Nunca como relleno grande**: eso fue lo que se veía amateur.
- El degradado ordena los colores de marca **por luminancia**, de claro a oscuro.

**Tokens de glass** (en `css/bundle.css`, no inventar valores):

| Variante | Uso |
|---|---|
| `.glass` | Dropdowns, tooltips, modales por defecto |
| `.glass-black` | El oficial del header; **única variante permitida en cards** |
| `.glass-white` | Nombre legacy — hoy es una superficie sólida, ya no es glass |

Regla general: **glass y glass-white están reservados a botones especiales**;
glass-black es la excepción permitida en cards.

**Deuda visual conocida:** el naranja legacy `#ff5400` está casi muerto, pero
`#ff6500` / `--warm-*` es la deuda nueva. Hay más de 40 tamaños tipográficos ad-hoc y
tres familias de iconos conviviendo (Font Awesome subset, Phosphor subset y ~103 SVG
propios de estilo Lucide monoline). Antes de crear un SVG nuevo hay que revisar
`recursos/icons/`.

---

## 4. Internacionalización

Sistema ES/EN dinámico con el modelo **"el español es la clave"**: el texto español
en el código *es* la clave. En español `__(key)` devuelve la propia clave (cero
regresión); en otro idioma busca catálogo y cae a la clave si falta.

- Global: **`window.__()`** (estilo gettext). Se descartó `t` porque colisionaba con
  variables locales en 39 archivos.
- Detección: `localStorage.userLocale` → `profiles.locale` → `navigator.language` → `es`.
- Extractor: `node scripts/i18n-extract.mjs` (con `--prune` para borrar huérfanas).

**Trampa importante:** como la cadena en español es la clave, **cambiar el copy es
cambiar la clave**. Flujo obligatorio: editar el fuente → añadir la pareja ES/EN en
`js/i18n/en.js` → correr el extractor con `--prune` → `node --check` → commit.

Estado: fase 1 completa; fase 2 avanzada. Faltan las tres vistas gigantes (Studio,
Video, VeraView) y los compartidos `living.js`, `products.js`, `input-registry.js`.
No se traduce contenido de base de datos, sólo la UI.

---

## 5. Otras superficies construidas

- **Studio** — consola de producción. El canvas está **scopeado por run** (modelo
  Shakker: un output pertenece a un run), con deep-link `?run=ID`. Barra de
  herramientas completa: Editar, Mejorar 4K, Sin fondo, Mejorar texto.
- **Production / `living.js`** — galería de producciones. El modal separa
  **Resultado** (el copy generado) de **Briefing** (el prompt + las identidades usadas).
  El producto se muestra **por output**, no por run.
- **Command Center** — reconstruido desde 2026-05-27 como **canvas de nodos** estilo
  n8n, con biblioteca lateral tipo Figma. La jerarquía v2 (2026-07-03) añadió
  plantillas de ejecución: **Campaña › Conjunto › Creativo**, más nodos de
  optimización de Shopify y Mercado Libre.
- **Vera (VeraView)** — chat con protocolo de bloques interactivos
  (`[CLARIFY|PILLS|STEPS|METRICS|ACTIONS]`), confirmación inline `[CONFIRM]` para
  tareas costosas, puente `postMessage` para que los widgets embebidos invoquen
  acciones reales, galería de archivos generados y **badge "Vera"** en los hilos que
  ella misma inicia (con latido en el botón del sidebar cuando hay mensaje sin leer).
- **Portal de desarrollo** (`/dev/…`) — dashboard con RPCs propias, builder de flujos,
  consola de billing, gestión de organizaciones, provisioning de usuarios, léxico.
- **Billing** — pasarela dual Stripe (USD) + Wompi (COP), tab de Facturación, tienda
  de créditos, flujo de cancelación. MFA TOTP + magic link desplegados.

---

## 6. Auditorías del frontend (2026-07-02)

Dos auditorías el mismo día, ambas con conclusión convergente.

**Auditoría senior — tesis: "es un problema de *enforcement*, no de talento".** La
infraestructura buena existe pero las vistas no la adoptan. Plan de 5 puntos,
**los 5 ejecutados**:

1. Seguridad de endpoints de IA — `assertOrgMember` en todos los `kie-*` / `kling-*` /
   `openai-*`; `nano-banana` no tenía **ningún** guard; `kie-video-download` era un
   proxy anónimo. Cerrado.
2. Video de login: 27,4 MB → 3,6 MB, con cabecera de caché correcta.
3. RPC `admin_create_organization` verificada en producción.
4. **ESLint** con configuración flat, reglas de oro como `no-restricted-syntax` en
   vistas, y el ratchet `lint:ci` en CI.
5. `CanvasStore` desarmado (−143 líneas): se eliminaron los envoltorios sobre
   envoltorios. **Regla vigente:** para una feature nueva del canvas se edita la
   definición existente o el mixin — jamás un envoltorio sobre otro envoltorio.

**Benchmark contra SaaS premium (Linear/Stripe) — nota 4,8/10** (la barra premium es 8).
Tesis: *calidad en islas, sistema declarado pero no gobernado*. Lo visual núcleo se ve
premium y las primitivas están a nivel Linear, pero la adopción es minoritaria.
Ejecutado el mismo día: `ErrorHandler` global real (antes se invocaba una función que
nunca se definió, con 208 `catch` mudos detrás), placeholder monocromo en la galería
de Producción, y **build de Netlify** con `scripts/build-minify.mjs` que aplana los 24
`@import` de `bundle.css` en un archivo (~100 KB comprimido) y minifica **sin
*mangling***, porque los scripts comparten globales.

Ruta acordada, aún vigente: quick wins de percepción → reglas de lint que congelan la
deuda → goteo por vista (cada vista que se toca sale 100 % al sistema). **No rediseñar.**

---

## 7. Gotchas del frontend que ya costaron tiempo

- **`supabase.rpc()` devuelve un *builder* "thenable", no una Promesa**: encadenar
  `.catch()` lanza `TypeError`. Hay que envolver en `Promise.resolve(...)`.
- **Síntoma "el componente renderiza a veces sí y a veces no"** = su CSS vive en un
  módulo con route-split. Los estilos de componentes compartidos van en el bundle.
- **Antipatrón `setup` crea / `render` destruye**: `setupXxx` crea controles dentro de
  un contenedor que `renderXxx` reescribe con `innerHTML`.
- **`max-width` + `margin:auto` copiado al contenedor raíz de cada página** corta el
  contenido ancho. Bug recurrente.
- **Un fallback de media debe rendirse si el medio carga**, y `[hidden]` pierde contra
  un `display:block` de clase.
- **`node --check` sólo valida sintaxis, no referencias no definidas.** Hay que correr
  eslint antes de empujar.
- **Aislamiento multi-organización:** filtrar cada consulta por la organización
  **activa**, no por `user_id`. La RLS no alcanza para esto.
