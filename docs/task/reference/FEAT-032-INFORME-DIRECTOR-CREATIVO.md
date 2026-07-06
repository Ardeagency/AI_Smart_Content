# Informe tecnico — Limitaciones identificadas en ComfyUI para integracion en AI Smart Content

**Fecha:** 2026-05-24
**Destinatario:** Saul (Director Creativo)
**De:** Equipo de plataforma AI Smart Content
**Asunto:** Hallazgos tecnicos sobre ComfyUI y los workflows entregados en `flows_vera`. Diagnostico exhaustivo de obstaculos para llevarlos a produccion sin modificaciones.

---

## 1. Resumen de hallazgos

Tras revisar los 2 workflows entregados (`cat01_hero_ingredientes` de IGNIS y `papermate_master_back_to_school_v7`) y analizar a profundidad como funciona ComfyUI, identificamos **11 obstaculos tecnicos** que impiden ejecutar esos JSON directamente desde la plataforma AI Smart Content. Algunos son de arquitectura, otros de infraestructura, otros de operacion en multi-tenant. Este documento describe cada uno en detalle.

---

## 2. Que es ComfyUI realmente (a nivel tecnico)

ComfyUI **no es un formato de archivo, ni una herramienta de diseño exportable**. Es un **servidor web en Python** que se instala localmente en una maquina y queda corriendo en `http://localhost:8188`. Cuando tu abres ComfyUI en tu PC, lo que ves en el navegador es una interfaz que se conecta a ese servidor.

El JSON que entregas es la **representacion serializada del grafo de nodos**, pero ese JSON por si solo no hace nada. Necesita un servidor ComfyUI corriendo para interpretarlo y ejecutarlo. Es decir: el JSON es la receta, pero ComfyUI es la cocina. Sin la cocina (el servidor Python con todas sus dependencias instaladas), la receta no se puede preparar.

**Consecuencia practica:** Para "instalar tus flows" en algun lado, ese lugar necesita o (a) tener ComfyUI corriendo, o (b) tener un sistema que sepa traducir el JSON a otro lenguaje ejecutable.

---

## 3. Arquitectura interna de ComfyUI

Cuando ComfyUI procesa un workflow, internamente pasa esto:

1. El cliente (navegador) hace `POST` al endpoint `/prompt` con el JSON del grafo
2. El servidor lo valida, le asigna un `prompt_id`, y lo agrega a una **cola de ejecucion**
3. Un worker recorre la cola, toma el siguiente prompt, hace **topological sort** del DAG (decide en que orden se ejecutan los nodos segun sus dependencias)
4. Por cada nodo, busca su `class_type` en el registry de Python y ejecuta la funcion `execute()` correspondiente
5. Los outputs pasan a los nodos siguientes como tensors de PyTorch
6. Los eventos de progreso se emiten por **WebSocket** (`/ws`) al cliente
7. Al terminar, los resultados quedan disponibles en `/history/{prompt_id}`

**Hallazgos relevantes:**

- ComfyUI **procesa una sola cola, secuencialmente**. No tiene multi-tenant nativo. Si 3 clientes disparan workflows simultaneo, el segundo y tercero esperan al primero.
- **Todo el motor depende de PyTorch.** Aunque un workflow no use GPU, ComfyUI carga PyTorch al arrancar porque internamente maneja imagenes como tensores.
- El WebSocket es la unica forma robusta de monitorear progreso en tiempo real.
- El sistema esta diseñado **para uso personal en una maquina local**, no para servir multiples clientes.

---

## 4. Los dos formatos JSON: una fuente de confusion estructural

ComfyUI maneja **dos formatos JSON completamente distintos** para el mismo workflow:

### 4.1 Formato UI (lo que sale al hacer "Save" normal)

Estructura:
```json
{
  "nodes": [ {id, type, pos, size, widgets_values, ...} ],
  "links": [ [link_id, from_node, from_slot, to_node, to_slot, type] ],
  "groups": [...],
  "config": {...}
}
```

Incluye **posiciones visuales, colores, grupos, y todo el metadata de UI**. Es el formato que sale cuando guardas un workflow de la forma estandar.

**Ejemplo del repo:** `ignis/cat01_hero_ingredientes/cat01_hero_ingredientes.json` esta en este formato.

### 4.2 Formato API (lo que sale al activar Dev Mode → "Save (API Format)")

Estructura:
```json
{
  "1": {"class_type": "LoadImage", "inputs": {"image": "ref.png"}},
  "2": {"class_type": "KIE_NanoBananaPro_Image", "inputs": {...}}
}
```

Es un diccionario plano sin posiciones visuales. **Es el unico formato que la API HTTP de ComfyUI acepta**. Si intentas mandar el formato UI al endpoint `/prompt`, falla.

**Ejemplo del repo:** `papermate/papermate_master_back_to_school_v7/papermate_master_back_to_school_v7.json` esta en este formato.

### 4.3 El problema

Los 2 workflows que entregaste estan **en formatos distintos**. Eso significa que cualquier sistema que quiera ejecutarlos necesita saber **detectar el formato y normalizar** uno al otro antes de procesar. Es una fuente conocida de bugs y confusion en el ecosistema ComfyUI ([Issue oficial #1335](https://github.com/comfyanonymous/ComfyUI/issues/1335)).

---

## 5. Los custom nodes KIE_* y sus dependencias

Los workflows entregados usan **custom nodes** del proyecto `gateway/ComfyUI-Kie-API`. Estos no son nodos del ComfyUI base — son extensiones que el director instala manualmente en su carpeta `custom_nodes/`.

**Lo que descubrimos analizando el codigo fuente del custom node:**

| Aspecto | Detalle |
|---|---|
| Lenguaje | Python 3.12+ |
| Dependencias declaradas | `numpy`, `pydantic`, `requests`, `pillow` |
| PyTorch | Marcado como **opcional** en mypy overrides |
| GPU | No requiere GPU para los nodos KIE_* |
| Que hace el codigo | Toma los inputs del nodo, construye un payload, hace POST a `api.kie.ai/api/v1/jobs/createTask`, hace polling al status endpoint, descarga el resultado |

**Esto significa:** Los nodos `KIE_NanoBananaPro_Image`, `KIE_Kling3_Video`, `KIE_GPTImage2_I2I` y `KIE_Seedance2_Video` son **wrappers HTTP**. La GPU de tu PC **no genera nada** cuando ejecutas el workflow — solo manda llamadas a `api.kie.ai` y recibe los resultados ya generados.

**Hallazgo critico:** Los workflows que entregaste **no usan computo local de ComfyUI**. Pero igual requieren ComfyUI corriendo para poder ejecutarse, porque ComfyUI es quien hace el orquestamiento (orden de ejecucion, paso de datos entre nodos, manejo de errores).

---

## 6. Diccionario de nodos: incompatibilidad estructural con la plataforma

ComfyUI tiene su propio **registro de nodos** definido en codigo Python. Cuando ComfyUI lee un JSON y encuentra `"class_type": "KIE_NanoBananaPro_Image"`, busca esa clase en su registro y ejecuta su funcion Python.

La plataforma AI Smart Content **no tiene este registro**. Su servidor de orquestacion (ai-engine) esta escrito en Node.js, no en Python. Aunque le diera el JSON tal cual, no sabria que hacer con el — para Node.js, `"class_type": "KIE_NanoBananaPro_Image"` es solo un string, no una funcion ejecutable.

**Misma situacion con n8n** (el sistema con el que la plataforma orquesta sus 3 flows actualmente en produccion): n8n tiene su propio registro de nodos (`HTTPRequest`, `Set`, `Code`, etc.) y no reconoce los tipos de ComfyUI. **Son dos diccionarios paralelos e incompatibles.**

**Consecuencia:** No existe ninguna forma de "cargar" un JSON de ComfyUI en la plataforma actual o en n8n. Cualquier integracion requiere o (a) tener ComfyUI real ejecutando, o (b) reescribir el comportamiento de cada nodo en el lenguaje del sistema que va a ejecutarlo.

---

## 7. Requerimientos de hardware: el problema de la GPU

ComfyUI fue diseñado pensando en correr modelos de IA pesados localmente (Stable Diffusion, Flux, ControlNet, etc.). Estos modelos requieren **GPU NVIDIA con CUDA** para procesar en tiempos razonables.

**Caracteristicas del servidor de la plataforma (ai-engine):**

- CPU: AMD EPYC-Milan, 8 vCPU
- RAM: 30 GB
- Disco: 226 GB NVMe
- **GPU: ninguna** (solo Virtio VGA virtual)

**Modo CPU-only:** ComfyUI tiene un flag `--cpu` que permite arrancar sin GPU. Pero esto solo sirve si los workflows **no usan ningun nodo que requiera GPU**. Hoy tus 2 workflows cumplen esta condicion (todos son KIE_*), pero cualquier nodo futuro que uses con modelos locales (`KSampler`, `VAEDecode`, `CLIPTextEncode`, `ControlNetApply`, `IPAdapter`, etc.) **se caera silenciosamente o tardara 30-40 minutos por imagen**.

**Costo aproximado de incorporar GPU al servidor:**

- Servidor Hetzner GEX44 (NVIDIA RTX 4000 Ada, 20 GB VRAM): **€184/mes (~$200 USD)** fijos, independiente del uso
- Servidor Hetzner GEX130 (RTX 6000 Ada): **€960/mes** para casos de alto volumen

Ambos son costos fijos mensuales que se pagan independientemente de si los workflows se ejecutan o no.

---

## 8. La cola unica: incompatibilidad con multi-tenant

La plataforma AI Smart Content esta diseñada como **multi-tenant**: varias organizaciones (IGNIS, Papermate, futuros clientes) comparten la misma infraestructura. Hoy proyectamos 5-10 organizaciones activas en los proximos meses.

**Problema identificado:** ComfyUI procesa **una sola cola de ejecucion secuencial**. Es decir:

- Si IGNIS dispara el flow `cat01_hero_ingredientes` a las 14:00:00
- Y Papermate dispara `papermate_master_back_to_school_v7` a las 14:00:05
- Papermate **espera** a que termine el de IGNIS antes de empezar

Con flows de Papermate (140 nodos, ~10-15 minutos de ejecucion total) esto significa que un cliente puede quedarse esperando 15 minutos por un slot. Para una plataforma profesional con clientes pagando, **esto es inaceptable**.

**Soluciones que se han discutido en la comunidad ComfyUI:**
- Levantar multiples instancias de ComfyUI en paralelo (cada una con su cola)
- Usar plataformas tipo RunComfy/ComfyDeploy que abstraen el escalamiento (pero implican costo extra)
- No usar ComfyUI directamente

Ninguna es trivial.

---

## 9. Concurrencia interna: limitacion adicional

Incluso dentro de un solo workflow, ComfyUI **no paraleliza nodos independientes**. Si tu workflow tiene 3 nodos `KIE_NanoBananaPro_Image` que podrian ejecutarse al mismo tiempo (porque no dependen entre si), ComfyUI los ejecuta **uno detras de otro**.

Para tus flows, esto significa:

- IGNIS `cat01_hero_ingredientes`: 3 imagenes NanoBanana podrian generarse en paralelo (~40s total) pero en ComfyUI van en serie (~120s total)
- IGNIS: 3 videos Kling 5s podrian generarse en paralelo (~90s) pero en ComfyUI van en serie (~270s)
- Papermate: 14 imagenes NanoBanana en serie = ~9 minutos solo de imagenes
- Papermate: + 11 GPTImage2 en serie = ~5 minutos adicionales

**Tiempo total Papermate en ComfyUI nativo: 15-20 minutos.** En un sistema con paralelismo, el mismo workflow podria ejecutarse en 2-3 minutos.

---

## 10. Mantenimiento de custom nodes: deuda operativa

Los custom nodes que dependen de tus workflows (`ComfyUI-Kie-API`) son codigo Python desarrollado por terceros, fuera del nucleo de ComfyUI. Esto genera varios obstaculos:

### 10.1 Updates incompatibles

Cuando ComfyUI lanza una version nueva, frecuentemente rompe la compatibilidad con custom nodes que no estan al dia. Esto es un problema conocido y documentado en la comunidad. ([referencia](https://docs.comfy.org/troubleshooting/custom-node-issues))

### 10.2 Dependencias Python conflictivas

Cada custom node trae sus propias dependencias Python. Cuando se instalan multiples custom nodes, es comun que sus versiones de `numpy`, `pillow`, `torch` o `transformers` entren en conflicto, dejando el entorno roto.

### 10.3 No hay garantia de soporte

Los repos de custom nodes son mantenidos por individuos o equipos pequeños. No hay SLA, no hay soporte oficial, y un proyecto puede ser abandonado en cualquier momento.

### 10.4 Tamaño de la instalacion

Una instalacion limpia de ComfyUI con sus dependencias base ocupa **3-5 GB** en disco. Con custom nodes y modelos descargados, puede crecer a **20-50 GB**.

---

## 11. Ausencia de capa de control para multi-tenant

ComfyUI no tiene mecanismos para:

| Lo que necesita una plataforma profesional | Lo que tiene ComfyUI |
|---|---|
| Autenticacion por organizacion | Nada (todo es publico en el servidor local) |
| Cobro de creditos por ejecucion | Nada (es uso personal) |
| Permisos por usuario | Nada |
| Aislamiento entre clientes | Nada (todos comparten el mismo servidor) |
| Auditoria de ejecuciones | Logs basicos en disco |
| Rate limiting | Nada |
| Soft delete / versionado de workflows | Nada |
| Conexion a fuentes de datos externas | Solo via custom nodes adicionales |

Todas estas capacidades **tendrian que construirse como capa adicional encima de ComfyUI** para usarlo en un contexto SaaS profesional. No es trivial — RunComfy y ComfyDeploy son empresas enteras que viven de resolver justamente esto.

---

## 12. Inputs de usuario: ausencia de patron estandar

La plataforma AI Smart Content presenta a cada cliente un **formulario auto-generado** para configurar cada ejecucion (escoger productos, ajustar prompts, definir cantidad, etc.). Este formulario se construye a partir del campo `input_schema` que vive en la base de datos.

**Problema:** Los workflows de ComfyUI **no tienen una manera estandar de marcar "esto es un input del usuario"**. Cualquier nodo `LoadImage`, `String`, o widget editable es teoricamente "modificable", pero no hay forma de saber **cual** es un parametro del usuario y cual es un valor fijo definido por el director.

La comunidad ha desarrollado el patron de **nodos sentinela** (`ComfyUIDeployExternalImage`, `ExternalText`, `ExternalNumber`) que se colocan explicitamente en el grafo para marcar inputs. **Tus workflows actuales no usan ese patron**, lo que significa que para auto-generar un formulario sensato hay que decidir manualmente que campos exponer al cliente final.

---

## 13. Versionamiento y cambios

ComfyUI no tiene un sistema de versionamiento de workflows incorporado. Cuando guardas un cambio en un JSON, el JSON simplemente se sobreescribe. No hay historial de cambios, no hay "rollback a version anterior", no hay diff entre versiones.

Para una plataforma profesional donde un cliente puede preguntar **"este flow lo cambiaste hace una semana? por que esta dando outputs distintos?"**, esto es una deficiencia operativa real. Tendria que construirse versionamiento por encima (lo cual ya hicimos en nuestra base de datos con la tabla `flow_revisions`, pero ComfyUI por si solo no lo soporta).

---

## 14. Resumen tabular de obstaculos identificados

| # | Obstaculo | Severidad |
|---|---|---|
| 1 | ComfyUI es un servidor Python, no un formato ejecutable | Alta |
| 2 | Dos formatos JSON distintos (UI vs API) que requieren normalizacion | Media |
| 3 | El motor depende de PyTorch (~1.2 GB) aunque no se use GPU | Media |
| 4 | Custom nodes con dependencias Python conflictivas entre si | Alta |
| 5 | ComfyUI requiere GPU NVIDIA para nodos de modelos locales | Alta (a futuro) |
| 6 | Nuestro servidor no tiene GPU; agregarla cuesta €184/mes fijo | Alta (a futuro) |
| 7 | Diccionario de nodos no compatible con Node.js ni con n8n | Alta |
| 8 | Cola unica secuencial sin multi-tenant nativo | Critica |
| 9 | No paraleliza nodos independientes dentro de un workflow | Alta |
| 10 | Updates de ComfyUI frecuentemente rompen custom nodes | Media |
| 11 | Sin auth, cobro, permisos, aislamiento, ni auditoria nativos | Critica |
| 12 | Sin patron estandar para marcar inputs del usuario final | Media |
| 13 | Sin versionamiento de workflows incorporado | Baja |
| 14 | Formatos no portables a otros sistemas (vendor lock-in del formato) | Media |

**Total: 14 obstaculos identificados. 4 criticos, 6 altos, 3 medios, 1 bajo.**

---

## 15. Lo que SI tenemos a favor (contexto)

No todo el panorama es negativo. Tenemos varios elementos en favor que vale la pena documentar:

- Tus 2 workflows actuales usan **100% nodos `KIE_*`**, que no requieren GPU. Esto significa que hoy estamos en el caso mas simple posible.
- La plataforma ya tiene **integracion completa con `api.kie.ai`** mediante 6 funciones implementadas (`kie-nano-banana-create`, `kling-video-create`, `kie-image-edit-create`, `kie-image-fix-text-create`, `kie-image-upscale-create`, `kie-image-remove-bg-create`).
- La plataforma ya tiene **3 flows en produccion** ejecutandose correctamente con su arquitectura actual.
- La base de datos ya tiene las tablas y RPCs necesarias para registrar flows nuevos (`content_flows`, `flow_modules`, `flow_schedules`, `flow_runs`, `runs_outputs`, etc.).

---

## 16. Datos verificados durante la investigacion

| Verificacion | Fuente | Resultado |
|---|---|---|
| Formato JSON IGNIS | `cat01_hero_ingredientes.json` | UI format, 30 nodos, 7 tipos distintos |
| Formato JSON Papermate | `papermate_master_back_to_school_v7.json` | API format, 140 nodos, 7 tipos distintos |
| Dependencias custom nodes KIE | `kie_nodes/pyproject.toml` en repo medram/Kie-API-ComfyUI | numpy, pydantic, requests, pillow. Sin torch hard-required |
| Especificaciones ai-engine | `ssh ai-engine` (verificacion en vivo) | 8 vCPU, 30 GB RAM, sin GPU, load 0.05, uptime 67 dias |
| Costo Hetzner GPU | hetzner.com/dedicated-rootserver | GEX44 €184/mes, GEX130 €960/mes |
| Documentacion oficial ComfyUI | docs.comfy.org | Arquitectura, endpoints, custom nodes |
| Casos comunidad | github.com/comfyanonymous/ComfyUI/issues | Issue #1335 (UI vs API formato), Issue #10078 (GPU detection) |

---

## 17. Cierre

Este informe documenta **lo que descubrimos** despues de:

- Analizar el codigo de los 2 workflows entregados
- Investigar la arquitectura interna de ComfyUI
- Verificar las dependencias reales de los custom nodes que usas
- Revisar el estado del servidor de la plataforma
- Consultar documentacion oficial y issues conocidos de la comunidad

**No se proponen soluciones en este documento.** El proposito es dejar claro **el terreno tecnico** sobre el que cualquier decision futura tendra que apoyarse. Las opciones de implementacion se discutiran en una sesion separada una vez confirmes que estos hallazgos quedan entendidos.

---

## Anexo: Referencias

- [ComfyUI Official Documentation](https://docs.comfy.org)
- [ComfyUI Workflow JSON Format spec](https://docs.comfy.org/specs/workflow_json)
- [Issue #1335 — Workflow format UI vs API confusion](https://github.com/comfyanonymous/ComfyUI/issues/1335)
- [Issue #10078 — GPU detection problems](https://github.com/Comfy-Org/ComfyUI/issues/10078)
- [ComfyUI Custom Nodes troubleshooting](https://docs.comfy.org/troubleshooting/custom-node-issues)
- [Repo flows_vera](https://github.com/Ardeagency/flows_vera)
- [Custom nodes KIE_* reference](https://github.com/medram/Kie-API-ComfyUI)
- [Hetzner GPU server matrix](https://www.hetzner.com/dedicated-rootserver/matrix-gpu/)
