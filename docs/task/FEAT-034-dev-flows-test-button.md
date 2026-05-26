---
id: FEAT-034
title: Boton "Probar flujo" en DevFlowsView es un stub
severity: low
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere definir el contrato de ejecucion en modo test (backend ai-engine) y decision de producto
est_duration: medium
created: 2026-05-26
---

# FEAT-034 — Probar flujo en modo test (DevFlowsView)

## Sintoma

`js/views/DevFlowsView.js` → `testFlow(flowId)` no ejecuta nada: hace `console.log`
y muestra el toast "Funcionalidad de prueba en desarrollo". El boton existe en la UI
del portal de developer pero no dispara una corrida real.

## Evidencia

```js
async testFlow(flowId) {
  // TODO: Implementar prueba de flujo
  console.log('Testing flow:', flowId);
  this.showNotification('Funcionalidad de prueba en desarrollo', 'info');
}
```

## Pasos para resolver

1. Definir el contrato de "test run": ¿corre el flow con inputs dummy?, ¿no cobra
   creditos?, ¿escribe en runs_outputs con flag de test? Coordinar con el motor de
   flows (ver FEAT-033 puente ComfyUI / execute_scheduled_flow).
2. Endpoint o reuso del webhook de ejecucion con `mode: 'test'`.
3. Cablear `testFlow` para llamarlo y reflejar estado (loading / link a logs).

## Criterio de done

Click en "Probar flujo" dispara una corrida real (o simulada controlada), el usuario
ve resultado/estado, y no quedan `TODO`/console.log en `testFlow`.
