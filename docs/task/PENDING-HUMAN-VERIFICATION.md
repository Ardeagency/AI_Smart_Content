# Pendiente SOLO de verificacion / activacion humana

**Consolidado: 2026-05-27** (reconciliacion docs/task vs codigo vivo).

Todas estas tareas tienen el **codigo hecho y desplegado**. NO falta trabajo de
ingenieria: falta una accion humana que un agente no puede ejecutar (prueba en
browser real, credenciales externas, click-through de validacion). Cuando cada
una se valide, borrar su bloque de aqui. Cuando el archivo quede vacio, borrarlo.

Los archivos individuales originales (FEAT-015/017/019/020/021b, OPS-007,
CHARTJS, BUG-004, SPRINT-FRONTEND-100) fueron eliminados y consolidados aqui.

---

## FEAT-019 — Pasarela de pago Stripe (USD) + Wompi (COP)
- **Hecho**: schema completo + 9 Netlify functions `api-billing-*` (checkout, portal,
  webhook, gateways, wompi-checkout/webhook/setup-source/charge-source, cancel) +
  `BillingService.js` + UI Planes/Credits/tab Facturacion. Wompi sandbox validado E2E
  (pago $240k aprobado, webhook procesado, creditos sumados).
- **Falta (humano)**: crear cuenta Stripe real + 2 env vars en Netlify; activar Wompi
  produccion cuando llegue; correr los 5 escenarios E2E con credenciales reales.

## FEAT-020 — MFA TOTP + magic link + revoke sessions
- **Hecho**: migration `mfa_required` + RPC + VIEW aplicadas; UI tab Seguridad en
  `OrganizationView.js` (enroll modal, QR, set_org_mfa_required). Commit `b9511e19`.
- **Falta (humano)**: 5 escenarios E2E en browser real con app Authenticator
  (escanear QR -> verificar paso MFA en re-login -> revoke sessions).

## FEAT-021b — Demo publica `/demo` sobre IGNIS
- **Hecho**: `DemoGuard.js` + banner condicional + RLS RESTRICTIVE + anon auto-join
  trigger + ruta `/demo` + OAuth buttons interceptados. Desplegado vivo.
- **Falta (humano)**: verificacion live post-deploy: entrar a `/demo`, validar las 6
  known limitations y abrir el modal "Solicitar acceso" en Meta/Google/Shopify.

## FEAT-015 — Pre-flight cost confirmation en Vera
- **Hecho**: `VeraView.js` maneja `status === 'cost_confirmation_required'` y abre el
  confirm; reenvia con `confirmed_high_cost`. Backend ai-engine estima costo.
- **Falta (humano)**: enviar un mensaje "pesado" desde browser -> confirmar que el
  bloque de confirmacion aparece y que Autorizar/Cancelar funciona visualmente.

## FEAT-017 — Content Feed unificado (ContentView estilo IA_Partner)
- **Hecho**: bloques A-F cerrados (item nav "Content", HogarView eliminado, DemoGuard,
  filtros FAB con date picker, carga progresiva de media, persistencia localStorage).
  `content-feed.css` en bundle.
- **Falta (humano)**: smoke test E2E en browser sobre una org con datos (esperado
  ~359 posts competidor + 357 signals) — validacion visual del feed.

## OPS-007 — Cifrado de tokens de integracion (Supabase Vault)
- **Hecho**: tokens YA cifrados at rest — `brand_integrations.access_token`/`refresh_token`
  muestran `enc_v1:...` (Facebook/Google/Shopify); `supabase_vault` 0.3.1 instalado.
- **Falta (humano)**: smoke test de decrypt-on-read via `integration-token.js` —
  confirmar que un OAuth flow real lee y descifra el token correctamente.

## CHARTJS_FORMAT_SUPPORT — Soporte Chart.js en chat de Vera
- **Hecho**: `VeraView.js:776` `_normalizeChartJsSpec()` implementado (aliases
  case-insensitive, multi-serie, per-item colors, cutout gauge), invocado en
  `buildEChartsOption`.
- **Falta (humano)**: prueba manual con Vera de los 10 chart types (prompt en el doc
  original) para validar render.

## BUG-004 — Verificar VeraView end-to-end
- **Hecho**: auditoria backend OK (proxy vivo, `chat.controller.js` correcto, realtime
  habilitado, `ai_messages` poblada). NO es bug tecnico.
- **Falta (humano)**: escribir un mensaje real desde el browser autenticado y confirmar
  POST + respuesta via realtime.

## SPRINT-FRONTEND-100 — Sprint exponer 100% del backend
- **Hecho**: las features individuales del sprint se verificaron COMPLETED por separado
  (FEAT-007/008/011/013/021/023/026 + dashboards). El plan ya esta sustancialmente
  entregado.
- **Falta (humano)**: verificacion visual de cierre del sprint (4 dashboards + paginas
  nuevas sin placeholders). Si todo OK, cerrar definitivamente.
