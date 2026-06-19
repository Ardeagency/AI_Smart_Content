# Inputs identificados

Registro de inputs (campos de `flow_modules.input_schema`) que se **crearon, editaron, ajustaron, duplicaron u optimizaron** durante la construccion de flows (FEAT-033 — puente ComfyUI multi-tenant).

Convencion: un archivo por input nuevo o por flow registrado. Cada entrada documenta:
- **Que es** el input (key, type, input_type, data_type)
- **Por que** se necesito (que nodo del flow lo consume)
- **Estado**: identificado / creado / editado / pendiente-UI
- **Donde** se uso (flow_slug)

Los `input_type` ya soportados por la plataforma se reusan; los nuevos se marcan como `pendiente-UI` (requieren renderer en el frontend).
