# ADN de marca — AI Smart Content

> Documento maestro del lenguaje visual y de comunicación oficial de AI Smart Content (AISC),
> extraído del **landing** (Framer, aismartcontent.io) que construyeron el director creativo y el
> diseñador gráfico. **Esta es la fuente de verdad del ADN.**
>
> Fecha de extracción: 2026-06-22 · Vía: Framer Server API (read-only).
> Datos crudos: `~/.claude/arde-tools/framer/landing-dna/` (colors.json, text-styles.json,
> fonts.json, collections.json, canvas-tree.json, copy.txt, code/*.tsx, code-index.json).

---

## 0. Propósito y reglas del juego

- **El landing = ADN oficial.** Lenguaje, comunicación, estilo y enfoque visual establecidos por el
  equipo creativo. Fuente de verdad de marca.
- **El frontend (console.aismartcontent.io) = otro diseño A PROPÓSITO.** Pensado para **adaptarse al
  ADN de cada marca cliente** y crear una **simbiosis** entre el ADN de esa marca y el de AISC. Nació
  ANTES de que el ADN oficial existiera, por eso hoy todavía no lo comunica.
- **Objetivo: estudiar y aprender, NO rediseñar todo ni copiar/pegar.** Aplicar el ADN de forma
  incremental: páginas puntuales, widgets, animaciones, inicios, transiciones — hasta que landing y
  plataforma se sientan la misma plataforma, respetando la simbiosis con la marca cliente.

---

## 1. Sistema de color

Filosofía: **monocromo oscuro y dramático**, jerarquía construida con **blancos por opacidad** (no
con color), y **color vivo solo como acento puntual**. Coincide con la regla interna "UI minimalista
monocromo, nada de gradientes chillones".

### Neutros oscuros (fondos / superficies)
| Nombre | RGB | HEX |
|---|---|---|
| Black 500 | 0,0,0 | `#000000` |
| UI 2 | 8,8,8 | `#080808` |
| BG Dark | 10,10,12 | `#0a0a0c` |
| Background (dark) | 10,10,10 | `#0a0a0a` |
| UI | 13,13,13 | `#0d0d0d` |
| Black 400 | 15,15,15 | `#0f0f0f` |
| Black 300 | 50,50,50 | `#323232` |
| Border | 34,34,34 | `#222222` |
| Gray 400 | 69,69,69 | `#454545` |

### Blancos por opacidad (jerarquía y profundidad)
`White 2%` `#fff`@0.02 · `White 5%` @0.05 · `White 7%` @0.07 · `White 8%` @0.08 · `White 10%` @0.10 ·
`White 15%` @0.15 · `White 20%` @0.20 · `White 50%` @0.50 · `White 60%` @0.60 · `White 70%` @0.70 ·
`Border` `#fff`@0.10. Texto: `white 500 #ffffff`, `white 400 #e6e6e6`, secondary `#cccccc`.

### Grises (texto secundario / desactivado)
`Gray 100 #bfbfbf` · `Gray 200 #999999` · `Gray 300 #7a7a7a / #a9a9a9` · `Text #808080 / #999999`.

### Acentos vivos (uso MÍNIMO, puntual)
| Nombre | HEX |
|---|---|
| Blue | `#0063ff` / `#0055fe` |
| Coral / salmon | `#ff2553` |
| Pink | `#df7afe` |
| Purple | `#4f1ad6` / `#814ac8` |
| Cian (blue) | `#15b8dc` |
| Red | `#e20616` |
| Amarillo (Degradado) | `#ffe500` |
| Amarillo 2 | `#fff077` |
| Naranja | `#ff6500`@0.44 |

### Espectro de marca
El gradiente firma (rojo → naranja → amarillo → verde → cian → azul → violeta) — el **mismo** que se
usó en el icono de app "Onyx". Es el único momento donde el color se despliega de lleno; el resto del
sistema es monocromo.

---

## 2. Tipografía

Tres familias **core** (las que cargan el ADN) + secundarias (algunas son residuo de plantilla).

- **Display / Headings:** `Nouvelle Grotesquerie` (H1) y `Apfel Grotezk` (H2–H5, peso 500). Grotescas.
- **Cuerpo / UI:** `Spline Sans Mono` (monoespaciada, 300/500). Firma técnica/editorial.
- **Secundarias presentes:** Switzer, Manrope, Inter Display, DM Sans, Geist (varias parecen relleno
  del template; el núcleo de marca son las 3 de arriba).

### Escala tipográfica (real, del landing)
| Estilo | Familia | Peso | Size | Line-height | Letter-spacing | Caso |
|---|---|---|---|---|---|---|
| Heading 1 | Nouvelle Grotesquerie | 400 | 100px | 0.9em | 0 | UPPER, center |
| Heading 2 | Apfel Grotezk | 500 | 70px | 0.9em | -0.05em | UPPER |
| Heading 3 | Apfel Grotezk | 500 | 64px | 0.9em | -0.03em | UPPER |
| Titulos (H4) | Apfel Grotezk | 500 | 60px | 57px | 0 | UPPER |
| Titulos 2 (H5) | Apfel Grotezk | 500 | 50px | 1em | -0.02em | UPPER |
| Usar este | Apfel Grotezk | 400 | 54px | 50px | -1.9px | — |
| Heading 4 title | Apfel Grotezk | 500 | 42px | 0.9em | -0.01em | center |
| semi | Apfel Grotezk | 500 | 40px | 42px | 0 | UPPER |
| potentes nueves | Inter Display | 400 | 32px | 110% | -0.03em | — |
| Titulo principal | Geist | 500 | 32px | 1.1em | -1px | — |
| Subtitulo | Apfel Grotezk | 500 | 30px | 35px | 0 | — |
| Sub | Apfel Grotezk | 500 | 28px | 0.9em | -0.02em | — |
| Body / Button / Links / Body1 / Corrido | Spline Sans Mono | 300/500 | 14px | 1.4em | +0.04em (links +0.02) | UPPER |
| Body 2 | Switzer | 600 | 16px | 1em | 0 | UPPER |
| Body 4 / Texto bloque | Manrope | 300 | 16px | 1.4em / 130% | +0.04em | — |
| Body 3 / Texto bloque peq | Manrope | 400/600 | 12px | 1.4em / 110% | +0.04em | — |

### Reglas tipográficas del ADN
1. **MAYÚSCULAS** en casi todo (headings y UI). Es la firma más fuerte.
2. **Monospace (`Spline Sans Mono`) para cuerpo/botones/links** con tracking positivo (+0.04em) →
   look técnico/editorial.
3. **Display enorme con line-height apretado (0.9em) y tracking negativo** → impacto editorial.
4. Etiquetas/eyebrows entre paréntesis en mayúscula: `( MOTOR CREATIVO )`.

---

## 3. Motion / interacción (los 24 componentes de código)

El landing es **cinematográfico y scroll-driven**. Código real en `landing-dna/code/*.tsx`
(reutilizable / portable al frontend):

| Componente | Qué hace |
|---|---|
| `Reveal_Text.tsx` (+ 6 variantes) | Revelado de texto al entrar en viewport |
| `Text_Opacity_Letters.tsx` (+1) | Opacidad letra por letra, scroll-driven |
| `ScrollText.tsx` (+2) | Texto animado por scroll |
| `Particles.tsx` (38KB) | Fondo de partículas |
| `FloatingParticlesBackground.tsx` | Partículas flotantes de fondo |
| `IconWebglShader.tsx` | Efecto shader WebGL en iconos |
| `SequentialCarousel.tsx` (20KB) | Carrusel secuencial |
| `Floating_Animation.tsx` | Flotación sutil de elementos |
| `Zom_image.tsx` | Zoom de imagen |
| `Phosphor.tsx` / `Phosphor_1.tsx` | Set de iconos Phosphor |
| `ScrollbarHider.tsx` | Oculta scrollbar (estética limpia) |
| `LimitlessPro.tsx` (88KB) | Sección/template grande |

Lenguaje de movimiento: **revelados al scroll, opacidad progresiva, flotación, partículas, shaders,
zoom**. Profundo, vivo, premium — nunca brusco.

---

## 4. Composición y narrativa (estructura del landing)

Breakpoints: **Desktop / Tablet / Phone**. Secuencia de secciones (narrativa de la página):

`Home` → `Un Centro` → `Tex` → `Video` → `Marcas` → `Centro` → `info` → `Imagen` → `Explicacion` →
`Seccion` (x2) → `Process` (Item 1–4) → `Zona` → `Porcentajes` → `VIDEO` → `Es como tener` →
`Un sistema que` → `ARQUITECTURA` → `Vera` / `Vera 2` → `ninguna otra` → `Por que` → `preguntas` (FAQ).

Arco narrativo: **hook → problema → solución/diferencial → producto (VERA / arquitectura) → prueba
(marcas, porcentajes, video) → cierre (por qué / FAQ).**

---

## 5. Tono y comunicación

- **Posicionamiento (frase madre):** *"Un ecosistema estratégico que analiza el mundo en tiempo real
  para garantizar que una marca se mantenga siempre relevante, competitiva y proactiva."*
- **Anti-posicionamiento:** *"No es solo una herramienta para crear imágenes con IA."*
- **Tagline:** *"Tu marca, al ritmo del mundo."*
- **Estructura problema→solución** — "EL PROBLEMA DE LAS MARCAS HOY" (01–05):
  1. Llegan tarde al mercado · 2. Compiten en desventaja · 3. Pierden consistencia ·
  4. Producen lento · 5. Repiten sin aprender.
- **VERA:** *"EL CEREBRO AUTÓNOMO DE AI SMART CONTENT… no empieza de cero cada vez. Acumula lo que
  aprendes, recuerda lo que apruebas y ajusta cómo decide… Tú defines hasta dónde llega VERA."*
- **Respaldo:** *"POWERED BY ARDE AGENCY"*, *"El mismo motor cinematográfico que ya entrega para
  enterprise."*
- **Voz:** estratégica, confiada, directa; marca-cliente como protagonista; español; mayúsculas.

---

## 6. Principios destilados del ADN (para aplicar)
1. **Monocromo primero**, color solo como chispa puntual; profundidad por opacidad de blanco.
2. **Mayúsculas + grotesca display + monospace de UI** = la voz tipográfica.
3. **Movimiento cinematográfico al scroll** (revelado, opacidad, flotación, partículas).
4. **Negro profundo + grano/hairlines** (`#fff`@0.05–0.10 para bordes y separadores).
5. **Narrativa editorial**: eyebrow en `( )`, numeración 01–05, titulares enormes, cuerpo mono.
6. **Marca-cliente protagonista** → encaja con la simbiosis del frontend.

---

## 7. Gap del frontend (mapeado contra Figma — 2026-06-22)

Comparación del frontend actual (maqueta `Sj1AK4L9hQ6iuCbdlR8j2E`, página única "Recursos", que
refleja `bundle.css`) contra este ADN. Tres conclusiones: **el color ya está alineado**, **la
tipografía es la brecha grande**, **el motion cinematográfico falta**.

### 7.1 Color — ✅ ALINEADO (no rediseñar)
El frontend ya vive la filosofía del §1: monocromo oscuro + glass + jerarquía por opacidad de blanco,
color solo en semánticos/acento. No tocar la base. Equivalencias de tokens (Figma `11:69`):
| ADN (landing) | Frontend (`bundle.css`) | Nota |
|---|---|---|
| Black/UI `#000`–`#0d0d0d` | `bg/primary #0b0b0b`, `bg/secondary #141517`, `bg/tertiary #000` | mismo registro |
| Blancos por opacidad 2–80% | escala glass/white 5,8,10,15,20,50,80,95 | mismo sistema |
| Border `#222222` | `border/divider #242424` | casi idéntico |
| Acentos vivos puntuales | semánticos #00d614/#ffe500/#ff0000/#00e7ff + warm/builder/dev | frontend tiene MÁS color del que pide el ADN → ver 7.3 |

### 7.2 Tipografía — ⚠️ BRECHA PRINCIPAL
Frontend = **una sola familia, Inter** (escala 11–40px). Ausentes las 3 familias core del ADN y su
firma. Esto es lo que más separa landing de plataforma:
| Eje ADN | Landing | Frontend hoy | Acción de simbiosis |
|---|---|---|---|
| Display | Nouvelle Grotesquerie / Apfel Grotezk | Inter | introducir grotesca en titulares/hero (no en cuerpo) |
| Cuerpo/UI | Spline Sans Mono (mono, +tracking) | Inter | mono en eyebrows, datos, labels técnicos |
| Caso | MAYÚSCULAS (firma) | mixed-case | UPPER en eyebrows/labels/botones, no en párrafos |
| Tracking | display −, mono + | default | aplicar al introducir familias |

### 7.3 Motion — ⚠️ FALTA LA CAPA CINEMATOGRÁFICA
Frontend (Figma `25:21`) ya tiene motion **funcional**: easings, escala de duraciones, @keyframes,
skeletons, sidebar 220/51px @0.3s, micro-interacciones. **No** tiene la capa scroll-driven del §3
(Reveal_Text, opacidad letra-a-letra, ScrollText, Particles, shaders, zoom). Los 24 `.tsx` del landing
son portables a intros/transiciones/widgets sin tocar el motion funcional existente.

### 7.4 Gradiente firma — reservar, no esparcir
El espectro de marca (§1) existe en Figma como frame `12:55` "Gradientes de marca". El ADN manda usarlo
**solo** como momento de color pleno (branding/icono Onyx), nunca en nav/cards. Coincide con la regla
[[feedback_ui_minimalista_monocromo]].

### 7.5 Puntos de entrada de la simbiosis (alto impacto / bajo riesgo)
Frames ya existentes en la maqueta donde aplicar primero, sin rediseñar:
- **Empty State premium** `133:14` (helper `BaseView.emptyState`) → grotesca + eyebrow en `( )` + mono.
- **Hero de Mi Marca** / dashboards Org `147:14`/`154:14`/`158:14` → titular display + label mono.
- **Login / onboarding** → un Reveal_Text/Particles portado del landing como primer contacto.
- **NODE LAB / Command Center** `108:12` → ya es la estética glow-oscuro más cercana al landing.

## 8. Cómo aplicar (incremental — se detalla en el plan, Tarea #4)
- **Tokens:** ✅ **Hecho en Figma (2026-06-22).** El ADN del landing vive ahora en la maqueta
  `Sj1AK4L9hQ6iuCbdlR8j2E` junto al sistema del frontend: colección de variables **`AISC DNA`** (60
  vars: 45 color — neutros/blancos por opacidad/texto/acentos/espectro — + 15 tipografía: 3 familias
  STRING `font/*` y 12 tamaños FLOAT `size/*`, todas con scopes explícitos) + sección visual
  **`AISC DNA — Landing` (node `286:28`)** con tarjetas Colores/Espectro/Tipografía/Botones, swatches
  y botones vinculados a las variables. El espectro firma se capturó pixel-a-pixel del icono Onyx
  (rojo `#c81500`→naranja `#ff7200`→amarillo `#fedb00`→verde `#49da0e`→cian `#00e3dd`→azul `#0049f1`→
  violeta `#5a0197`). Es la "capa AISC DNA" que el theming por marca cliente puede heredar/mezclar.
  La sección incluye además tarjetas **Contenedores & cards** (reproducción del hero "Porcentajes":
  glow del espectro→negro + 3 columnas con hairline + números display; y variantes de card
  glass/sólida/hairline) y **Efectos & estilos**. Se crearon **6 Effect Styles** (`AISC DNA/Glow
  espectro`, `Glow suave`, `Glass background-blur`, `Sombra card/hover/floating`) y **2 Paint Styles**
  (`AISC DNA/Espectro de marca`, `Glow bloom`). Gotcha: los styleId se aplican con
  `setFillStyleIdAsync`/`setEffectStyleIdAsync` (async, id con coma final), no por asignación síncrona.
- **Tipografía:** introducir Apfel Grotezk / Nouvelle Grotesquerie / Spline Sans Mono donde refuerce
  marca (titulares, eyebrows, datos), sin romper legibilidad de la app.
- **Motion portable:** los `.tsx` del landing (Reveal_Text, Particles, ScrollText…) se pueden adaptar
  a widgets/intros/transiciones de la app.
- **Momentos clave primero:** login, estados vacíos, hero de Mi Marca, onboarding — alto impacto, bajo
  riesgo.

---

## 9. Hallazgos / pendientes
- ⚠️ **Copy residual de plantilla** en el landing ("Luminasphere", copy de RRHH en inglés
  "Remote-First Flexibility…") — relleno del template de Framer sin purgar. NO es ADN; marcar para
  limpieza con el equipo.
- `fonts.json` lista el **catálogo completo de Framer (9472)**, no las usadas; las reales son las 8
  familias de §2 (core: 3).
- `getVersions()` de los code files no es accesible con esta key ("missing read access to module
  owner"); el contenido actual sí.
- ✅ Acceso a Figma resuelto (MCP claude.ai, 2026-06-22). Frontend mapeado: maqueta de **una sola
  página** "Recursos" con Design System (Tokens `11:69`, Componentes `13:25`, Motion `25:21`), secciones
  Logos/Iconos/Colores, NODE LAB `108:12`, y mockups Org/Dev/Empty State. Brecha cuantificada en §7.

---

## 10. Inventario de datos crudos (`~/.claude/arde-tools/framer/landing-dna/`)
- `colors.json` — 100 estilos de color.
- `text-styles.json` — 26 estilos de texto (con size/lh/ls).
- `fonts.json` — catálogo de fuentes (grande).
- `collections.json` — CMS ("Works").
- `canvas-tree.json` — 746 nodos (estructura).
- `copy.txt` — 73 bloques de texto/copy.
- `code/*.tsx` + `code-index.json` — 24 componentes de animación/interacción.
- Scripts: `validate.mjs`, `explore.mjs`, `inspect.mjs` (proyecto Framer:
  `https://framer.com/projects/AI-Smart-Content--rUyDPiJZkcQyWPxwYvDX-1GEqh`).
