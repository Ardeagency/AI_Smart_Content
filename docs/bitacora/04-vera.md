# 04 — Vera

Vera es el cerebro de la plataforma: un agente LLM que percibe, triangula, decide y
ejecuta. **AI Smart Content no es Vera** — Vera es uno de sus componentes. Pero es el
componente que define el producto: sin ella, la consola sería otro tablero de métricas.

Vera corre en dos lugares distintos, y confundirlos cuesta tiempo:

| Vera del **chat** | Vera **autónoma** |
|---|---|
| Corre en el `ai-engine` | Corre en un **org-server** dedicado por organización |
| Se guía por el catálogo de tools + system prompt | Se guía por `SOUL` / `IDENTITY` / `AGENTS` / `USER.md` + skills |
| **No lee archivos de skill** | Sí: las skills `.md` se sincronizan por organización |
| No puede emitir HTML grande en un tool-call (colapsa el turno) | Sí puede |

---

## 1. El protocolo v3 (2026-05-21)

Documento fuente persistido en el servidor:
`/root/ai-engine/docs/protocolo/VERA_AI-ENGINE_v3_Protocolo_Tecnico_FORMATTED.txt`.

**Los tres movimientos cuando el ai-engine no puede.** Vera nunca se bloquea:

1. **Rodear** — usar las tools existentes creativamente para aproximar el resultado.
2. **Construir con lo que hay** — entregar el mejor análisis alcanzable y documentar
   la limitación explícitamente en el `reason` de la tool-call.
3. **Notificar a los devs** — crear una notificación técnica con qué capacidad
   necesita, por qué y qué impacto tendrá. Así el motor evoluciona guiado por Vera.

**Lo que Vera NUNCA hace, ni con autonomía total:** publicar en canales externos,
tocar audiencias o campañas en Meta/Google/TikTok Ads (sólo las conceptuales dentro
de la plataforma), gastar dinero, contactar personas o marcas externas, ver datos de
otra organización, inventar señales que no existen, o decidir una crisis de reputación
pública sin aprobación humana.

El protocolo se cerró **26/26 tools** en mayo de 2026, en cinco fases: aliases
canónicos, tools faltantes, reescritura del prompt, un parser `[[TOOL:...]]` con
máquina de estados que respeta JSON anidado y strings con caracteres especiales, y
validación sintética contra datos reales de IGNIS.

Hoy el catálogo real es mucho mayor: **144 tools en fases** (verificado 2026-07-27),
sobre un registro de ~154, repartidas en 20 archivos `*.tools.js`.

---

## 2. Niveles de autonomía

Gobiernan todos los gates. Viven en `organizations.level_of_autonomy`:

| Nivel | Qué permite |
|---|---|
| **restringido** | Vera pide permiso para todo |
| **parcial** | Produce contenido automáticamente (gasta créditos); **publicar sigue con gate** |
| **total** | Además publica en redes automáticamente |

**La frontera es publicar.** Este nivel *supersede* la regla anterior de
pre-aprobación para gasto visual: el nivel de autonomía **es** el permiso.

---

## 3. El pivote: de "proponer y esperar" a "ejecutar e informar" (2026-07-08)

Decisión del dueño: **Vera no propone y espera permiso — ejecuta.** Si ve conveniente
crear una audiencia, una estrategia, keywords o ADN, lo **crea** y luego **informa**
qué hizo y por qué. Las notificaciones dejan de pedir permiso: comunican lo hecho con
su evidencia. Además Vera puede **iniciar conversaciones** con humanos de la
organización sin esperar a que le escriban (tool `initiateConversation`).

**Frontera elegida:** ejecuta todo lo reversible e interno; gate humano sólo para
gastar presupuesto del cliente o publicar en canales externos. Resultó que esas
escrituras **ya no existen como tool de Vera** —viven como botón humano en el
frontend— así que el gate está garantizado estructuralmente, no por prosa.

**El bug que se destapó:** nueve recomendaciones de WAKEUP nunca se notificaron porque
la tool que las proponía sólo hacía un INSERT, sin crear notificación. Proponer y
avisar eran acciones desacopladas. El problema no era la autonomía —la organización
estaba en `parcial` y el gate no bloqueaba nada— era el **modelo mental "proponer"**.

En el frontend esto se tradujo en: badge "Vera" en los hilos que ella inicia, latido
en el botón de Vera del sidebar cuando hay mensaje sin leer, y redirección robusta
desde la notificación a la conversación.

---

## 4. El rediseño del cerebro (2026-07-24)

El trabajo más profundo sobre cómo Vera *piensa*. Los archivos viven en el servidor,
en `/root/ai-engine/defaults/`, y se sincronizan por organización.

**Hallazgo de arquitectura, investigado en el runtime:** las skills de OpenClaw son
*model-invoked* — el runtime arma un catálogo de nombre + descripción, y el cuerpo del
`SKILL.md` se carga bajo demanda **cuando el modelo decide**. No se puede forzar la
invocación. De ahí tres consecuencias de diseño:

1. Lo que **debe** aplicarse siempre va en `SOUL` (cómo piensa) y `AGENTS` (cómo
   opera), que están siempre en contexto — no en una skill.
2. Las skills se describen por **momento de necesidad** (cuándo usarla), no como
   doctrina pasiva, que el modelo ignora.
3. Una skill puede referenciar otras por nombre y el modelo las encadena.

### Las tres capas del cerebro

- **Doctrina (siempre encendida)** — `SOUL` + `AGENTS` + `USER.md`. `USER.md` es el
  manifiesto de la marca a la que sirve, incrustado en la organización: es lo que
  ancla el estándar de fidelidad.
- **Tools de razonamiento** — skills escritas como **preguntas que Vera se hace**, no
  como manuales de pasos. Cada una con su momento-gatillo y referencias opcionales a
  otras ("puedo aprovechar", como opción, no como regla).
- **Tools reales** — capacidades atadas a una herramienta, formato o dato. Se
  conservaron, renombradas para que el nombre diga lo que hacen.

### Las 10 tools de razonamiento

Cada una investigada contra literatura real antes de escribirse:

| Skill | Qué pregunta |
|---|---|
| `human-conversion-psychology` | Kahneman (Sistema 1/2), Berger STEPPS, Cialdini — el puente emocional |
| `reading-beneath-the-surface` | Klein (RPD), Heuer/ACH (falsear, no confirmar), señales débiles |
| `self-critique-loop` | Self-Refine + Reflexion multi-agente: crítica multi-lente |
| `learning-from-outcomes` | Destilar la lección y superarla; aprende del fracaso **y** del acierto |
| `breaking-the-predictable` | Von Restorff, de Bono, SCAMPER |
| `deciding-the-piece` | **Hub** de decisión de pieza; orquesta las demás y pregunta por lo que ya existe |
| `thinking-as-my-brand` | **Hub** de marca: Vera piensa *como* su marca, simbiosis no imitación |
| `the-receptive-moment` | "¿Es ahora o esperamos el clímax?" — objetivo-agnóstica |
| `leading-the-market` | Posición (líder/retador/seguidor/nicher), Ries & Trout, Byron Sharp |
| `reading-the-rivals-mind` | Porter (Cuatro Esquinas) + war-gaming: el punto ciego del rival |

**Se eliminaron 6 rulebooks** (forja de copy, atomización de contenido, matriz de
hooks, hilo narrativo, arquitectura de campaña, sensado de tendencias) porque el
modelo con razonamiento ya los cubre, más `cmo-strategizing` (Vera es CMO por
naturaleza).

**Una decisión que vale la pena recordar:** se investigó a fondo aplicar los
"Biotipos" (cuatro temperamentos) al análisis de audiencias y **se decidió no
hacerlo**. Etiquetar audiencias en cuatro cajas rígidas contradice la libertad
creativa y el análisis por lo que la audiencia **hace**; y usar heridas de infancia
para vender rompe la doctrina raíz.

Catálogo final verificado el 2026-07-27: **21 skills** en el servidor.

**Próximo gran paso propuesto:** *progressive tool disclosure*. Hoy se vuelcan ~140
tools en el prompt cada turno (~32 KB). La idea es darle un **índice de categorías** y
que pida bajo demanda, con un núcleo de ~10 siempre encendido. Es un cambio de
runtime, no de archivos `.md`.

---

## 5. Las lecturas de dashboard

Vera escribe lo que se ve en los tableros. Vive en la tabla `vera_dashboard_readings`,
y **conviven tres contratos distintos** — es fácil perderse:

| Contrato | Scope | Quién lo produce | Quién lo pinta |
|---|---|---|---|
| **`cards.v2`** | `mi_marca` | `runMiMarcaCards()` | `BrandGrid.mixin.js` |
| **narrative** (schema viejo) | `monitoreo` | `runDashboardSession()` | `CompGrid.mixin.js` |
| **`cards.v3`** | `diagnostico` | `runBrandDiagnosis()` | **Nadie, hoy** |

**El bug que costó las cards en blanco (arreglado 2026-07-23):** *nadie* producía
`cards.v2` en el scope `mi_marca`. Una sesión escribía `mi_marca` pero en formato
narrative, y el chequeo `=== 'cards.v2'` la ignoraba; la otra escribía v3 en otro
scope. La solución fue un **productor dedicado** con un esquema zod alineado exacto al
pintor del frontend.

Gotcha que costó tiempo: los bloques de visualización de v2 usan **nombres de campo
distintos** a los de v3. El esquema debe seguir al pintor del frontend, no al otro
esquema.

**Cómo funciona una sesión de lectura:** es una sesión agéntica **de sólo lectura**
(consentimiento bloqueado por completo). Vera excava datos crudos con tools, emite un
sobre `[[READING_JSON]]` o `[[DIAGNOSIS]]`, el ai-engine lo valida con zod y lo
persiste. Vera nunca toca credenciales.

**Patrón adoptado contra los rechazos de contrato:** los límites del **esquema son más
anchos** que los que pide el **prompt** (por ejemplo, título 70 en el prompt / 110 en
el esquema). Unos caracteres de más no pueden costar una lectura entera: tres sesiones
murieron por eso, una por **un solo carácter**.

---

## 6. Capacidades construidas

- **Generación de archivos** (`createArtifact`, 2026-06-16) — informes, decks 16:9,
  infografías, XLSX y Word, con los colores, la tipografía y el tono de cada marca.
  **Principio:** Vera nunca escribe HTML a mano; aporta contenido en markdown y el
  motor lo renderiza. Contenido y presentación separados, consistencia garantizada.
  Con galería en el frontend.
- **Investigación web real** (Tavily) como *domain tools* `webSearch` / `webFetch`,
  detrás del dispatcher — no como MCP de terceros.
- **Generación directa de imagen y video** por KIE desde el chat (ver [03-ai-engine](./03-ai-engine.md) §5).
- **Loop de outcomes** (2026-06-12) — tabla `vera_action_outcomes` con una fila por
  acción y ventana (24 h / 7 d / 30 d), medida **con reglas y matemática, sin LLM**.
  Compara el engagement contra la **mediana de los últimos 10 posts propios de la
  misma red** — cero llamadas a Meta. Incluye calibración: confianza declarada de Vera
  contra resultado real.
- **Núcleo decisional** (`proposePendingAction`, 2026-06-01) — con dos reglas duras:
  **regla de dos fuentes** (una sola señal no basta) y **gradación de riesgo** por tipo
  de acción, donde lo crítico (crisis, legal, posicionamiento) se rechaza y sólo puede
  ser notificación.
- **Cosecha de comentarios** bajo demanda y **generación de briefs de tendencias** por
  decisión propia (el cron de briefs se eliminó a propósito: *Vera decide cuándo hacer
  un brief*).
- **`getUpcomingDates`** — la tool que lee la misma fuente que la card Próximas Fechas.

---

## 7. La Intuición: el alma del producto

La card `intuicion` es donde Vera dice **lo que un tablero no muestra y un humano no
ve**. Está en nivel 2 de la jerarquía de Mi Marca y es **transversal a los cuatro
tabs** (es una sola lectura de la marca, así que se reutiliza).

**No es análisis de métricas. Es lectura de comportamiento y del alma de la audiencia.**

El usuario corrigió esto dos veces, y la lección quedó escrita:

> "Ver más allá de lo obvio" **no** es explicar por qué un post no convierte — eso es
> mecánica superficial. Es (1) entender emocionalmente a la audiencia, (2) juzgar si el
> **formato** la enamora o sólo la informa, y (3) investigar qué forma funciona de
> verdad para ese nicho.

**El caso que lo enseñó** (colaboración WAKEUP × DivingLife, julio 2026): un carrusel
infográfico titulado "el snack perfecto para bucear". El primer diagnóstico —"el
problema es dónde se publicó"— era malo. El segundo —"genera admiración, no antojo"—
seguía siendo superficial. Lo correcto: **el carrusel infográfico es el formato
equivocado para esa audiencia**; es corporativo, épico y frío, se aplaude por cortesía
y se olvida. Lo que la enamora es un **momento humano real**: un Reel del equipo
buceando, mostrando el nervio, cómo el otro equipo los cuidó y los hizo sentir en casa,
la energía al salir. Eso se ve por gusto, se comparte solo, y esa emoción sí vende —
para ambos socios.

Detalle de ejecución que importa: el acento de la card usa **el color dinámico de la
organización**, nunca morado. El morado inicial fue un error, corregido.

---

## 8. Estado real y bloqueadores

Honestidad sobre dónde está Vera hoy (**2026-07-27**):

- **Vera está en pausa controlada de cara al usuario** desde 2026-05-24. La fase es
  *endurecer herramientas*, no usar a Vera. No proponer demos públicas sin
  autorización explícita.
- **Bloqueador de infraestructura (2026-07-23):** al desplegar el productor de
  `cards.v2`, **ninguna organización tenía un agente OpenClaw sano** — todos
  detenidos. El guard corta antes de gastar, así que ninguna sesión agéntica produce
  lecturas en vivo. **El código es correcto y está desplegado; ese es el hueco real
  entre "código listo" y "cards visibles".**
- Las sesiones automáticas sólo corren para **WAKEUP**; IGNIS tiene org-server sano
  pero el planificador nunca lo dispara. Cadencia de 48 horas.
- La **card de audiencia** (mapa + pirámide) nunca aparece **aunque el dato exista**:
  las columnas demográficas están frescas, pero la tool que lee audiencias las deja
  fuera del `select`, y la tool que sí las trae **no está registrada** en el
  dispatcher. Vera obedece bien su prompt ("si no tienes el dato, omítela") — es la
  plataforma la que la deja ciega.
- Las VMs de org-server viejas **no tienen llave SSH**: se diagnostican sin shell, por
  el puente HTTP y la API de Hetzner. La causa típica de "el chat de Vera falla" en
  remoto es que el proceso hijo muere por falta de memoria en turnos pesados.
- **El cobro de los turnos fallidos ya no se cobra** desde el arreglo del 2026-07-14.
