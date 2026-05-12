---
id: SESSION-IMPACT-2026-05-12
title: Áreas potencialmente afectadas por la sesión de optimización masiva
type: notes
status: open
created: 2026-05-12
---

# Sesión de optimización 2026-05-12 — registro de áreas afectadas

Este archivo lista cambios que pudieron afectar comportamiento existente,
agrupados por archivo modificado. Útil para smoke testing post-deploy
y como referencia si surge una regresión.

## Cambios por archivo

### `css/bundle.css`
- **`.route-fade-in`**: duración 140ms→280ms, easing ease-out→cubic-bezier
  + translateY(6px). Si alguna vista dependía de timing exacto del fade,
  podría sentirse "lenta" o desincronizada.
- **Critical CSS inline en `<head>` (en index.html, pero relevante aquí)**:
  agrega `color-scheme: dark` global. Si hay alguna pantalla específica
  con light mode esperado, los form controls nativos del browser
  cambiarían apariencia.
- **`*:focus-visible` baseline**: outline de 2px en TODOS los elementos
  focusables. Si algún componente customizaba su propio outline con
  specificity baja, el nuevo baseline lo pisa.
- **`@media (prefers-reduced-motion: reduce) *`**: aplasta TODAS las
  transitions/animations a 0.01ms si el OS lo pide. Si alguna animación
  era load-bearing (depende del end-state después de la duración), podría
  verse extraño en usuarios con reduce-motion.
- **`content-visibility: auto` en `.task-card`, `.living-masonry-item`,
  `.flow-card`**: cards off-screen no se renderizan. Si alguien hace
  `getBoundingClientRect()` sobre cards aún no visibles, podría retornar
  0,0,0,0. JS que mide layout antes de scroll debe re-medir tras scroll.

### `js/router.js`
- **Delayed spinner (250ms)**: showSpinner ahora se llama en cualquier
  handleRoute lento. Si appLoader.showSpinner tiene side effects
  (lock, animations), pueden ejecutarse más seguido.
- **`_enhanceA11yLabels`**: post-render, copia `title` a `aria-label`
  en `button/a/[role=button]/[role=tab]` que no lo tengan. Si algún
  test E2E hace `[aria-label="foo"]` y antes no había, ahora sí
  aparecerá — los tests podrían matchear más nodos.
- **View Transitions API success path**: ahora también llama
  `_enhanceA11yLabels`. Igual que arriba.

### `js/utils/modal.js` (window.Modal.show)
- **Focus trap**: Tab/Shift+Tab ya no escapan del modal. Si algún flow
  esperaba que Tab saltara fuera del modal a propósito, ya no funciona.
- **Initial focus**: setTimeout(0) → primer focusable del body.
  Si una vista llamaba `.focus()` manualmente después del show, podría
  pelearse con el initial focus (el último gana).
- **Return focus**: al cerrar, foco vuelve al trigger original (si
  existe). Si el trigger se removió del DOM mientras el modal estaba
  abierto, el foco se queda donde caiga natural.

### `js/utils/toast.js` (window.showToast)
- **Antes `window.showToast` no estaba definido** → llamadas defensivas
  con `if (typeof === 'function')` no hacían nada. Ahora TODOS los
  toasts dispersos en living.js (6 sitios) van a empezar a mostrarse:
  "Prompt copiado", "Producción regenerada", "Output eliminado",
  errores de borrado. Si visualmente molesta, ajustar caller.
- **Detección online/offline global**: toast warning persistente al
  perder red, success 2.5s al recuperar. Si el usuario hace mucho
  switch de redes (móvil), verá toasts seguidos.

### `js/services/ErrorLogger.js`
- **Toast en window.error**: rate-limited 10s. Si una vista tiene un
  bug que dispara error cada acción, el user verá toast "Algo salió
  mal" la primera vez de cada ráfaga (no en cada error). En BD quedan
  todos los samples — el toast solo es feedback visual.

### `js/app-loader.js`
- **Service Worker register**: solo en host != localhost. Si alguien
  abría la app en `0.0.0.0` o `192.168.x.x`, el SW NO se registra.
- **SW update notification**: cuando hay deploy nuevo Y el user tiene
  la pestaña abierta de una versión anterior, aparece toast
  "Nueva versión disponible — recarga". Persistente hasta que recargue.
- **`registration.update()` cada 1h**: ping al servidor a buscar nuevo
  sw.js. Si la pestaña queda abierta días, sigue detectando deploys.

### `index.html`
- **Skip link**: primer Tab desde inicio = "Saltar al contenido".
  Si algún test E2E asume que el primer focusable es otro elemento,
  los selectores cambian.
- **`#app-container` con `tabindex="-1"`**: ahora puede recibir foco
  programático. Si JS hacía `app-container.focus()` antes y no funcionaba,
  ahora sí.
- **PWA manifest + theme-color**: barra del browser en móvil ahora
  oscura. Si el header tenía pretensión de fundirse con la barra
  blanca por default, ya no.
- **Preconnect a Supabase**: handshake TCP+TLS abre antes. Sin efectos
  negativos esperados (solo speedup).
- **Top-5 vistas prefetch idle**: el browser descarga JS de Dashboard/
  Studio/Production/BrandStorage/Tasks en background. Si el user nunca
  visita esas vistas, ~250KB de tráfico desperdiciado por sesión.

### `sw.js` + Service Worker general
- **Cache de assets versionados**: el browser puede servir versiones
  cacheadas. Si Netlify deploya un build con un bug, los users en
  cache del build anterior siguen viéndolo hasta el siguiente
  controllerchange (que ya muestra toast).
- **HTML siempre red**: garantiza que el bug fix llegue de inmediato.
- **Imágenes de Supabase Storage cacheadas**: si el user borra una
  imagen del storage, la cacheada local puede seguir viéndose por
  algunas horas (network-first → si red ok, refresca; si offline,
  sirve cache).

### `manifest.webmanifest`
- **start_url: /home**: usuarios que instalen la PWA abrirán /home
  directamente (no /). Si /home requiere auth y no hay sesión, redirige
  a /login. Comportamiento OK pero ojo si /home cambia.
- **Display: standalone**: la PWA instalada no muestra URL bar. Si el
  user quiere copiar la URL, debe hacerlo desde share/menu.

### Archivos nuevos
- `js/components/ColorPickerModal.js` — single source of truth para el
  picker; el mixin y input-registry son wrappers.
- `js/utils/toast.js`, `js/utils/webvitals.js` — utilities globales.
- `sw.js`, `manifest.webmanifest`, `offline.html`, `robots.txt`,
  `sitemap.xml` — infra nueva.

## Cambios añadidos en la segunda fase (post-SESSION-IMPACT inicial)

### `js/router.js` (continuación)
- **`_applyDocumentTitle`**: cambia document.title por vista. Si algún
  E2E test hace assertion sobre el title exacto, falla — necesita
  actualizarse para esperar `'{vistaTitle} · AI Smart Content'`.
- **`_scrollToHash`**: navegaciones con `#hash` ahora hacen
  scrollIntoView del elemento. Si una vista lazy-renderiza contenido
  después del montaje, el hash puede no encontrar el elemento (el
  rAF de _scrollToHash espera un frame, no más). Solución: la vista
  debe handle su propio scroll a hash tras lazy-load.
- **showError con `role="alert"` + `aria-live="assertive"`**: screen
  readers ahora interrumpen para anunciar errores fatales. Si hay tests
  que dependen del DOM exacto del error container, ahora trae 2 atributos
  más.

### `js/views/{TasksView,ProductionView,DashboardView,StudioView,BrandstorageView,BrandOrganizationView,FlowCatalogView,CommandCenterView,VideoView}.js`
- **`static documentTitle`**: cada vista declara su título. Si una
  vista ya manipulaba document.title manualmente (no encontramos
  ninguna), el router lo pisa después del mount.

### `index.html` (continuación)
- **`#app-container` con `role="main"` + `aria-label="Contenido principal"`**:
  las vistas que internamente tienen `<main>` ahora son sub-main —
  válido HTML pero algunos linters de a11y avisan "más de un landmark
  main". Si Lighthouse reporta esto, los `<main>` internos pueden
  cambiarse a `<section>` o `<div role="region">`.

### `js/components/Navigation.js`
- **`aria-current="page"`**: el link activo del sidebar ahora tiene
  el atributo. Si hay CSS con selector `[aria-current="page"]` que no
  esperaba existir, podría disparar estilos no intencionales (no
  encontramos tal CSS).

## Smoke test recomendado tras deploy

1. **Navegación base**: /home → /studio → /tasks → /flows → /brand-organization.
   Verificar transitions suaves, sin flash blanco, sin pop-in.
2. **Color picker**: editar un color de marca → ver orbit del aro
   funcionar, touch en móvil, hex parser tolerante (pegar #abc).
3. **Modales**: abrir cualquier modal → Tab debe ciclar dentro,
   Esc cerrar, click outside cerrar, focus vuelve al trigger.
4. **PWA**: en Chrome desktop debe aparecer "Instalar AI Smart" en
   address bar. Instalar y verificar app standalone.
5. **Offline**: DevTools Network → Offline → navegar a otra ruta →
   debe aparecer `/offline.html` con status dot rojo.
6. **Online/offline banner**: toggle Offline en DevTools mientras estás
   en una vista → toast warning. Volver Online → toast success.
7. **Skip link**: Tab desde inicio → debe aparecer "Saltar al contenido".
8. **Web Vitals**: en consola: `window.getWebVitals()` → array con
   FCP/TTFB; al cerrar tab los demás se mandan al ErrorLogger.
9. **Toasts**: alguna acción que dispare `window.showToast` (copy prompt
   en living.js) → debe aparecer arriba derecha.
10. **Service Worker update**: deployar otro commit (cualquiera),
    recargar antigua pestaña → debe aparecer toast "Nueva versión
    disponible".

## Si algo se rompe — kill switches

- **Service Worker**: `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))` en consola.
- **PWA instalada**: desinstalar desde el sistema operativo del user.
- **Critical CSS inline**: en index.html `<head>`, borrar el bloque `<style>` (revierte a bundle.css only — más FOUC pero funcional).
- **Reduce-motion override**: si rompe animación load-bearing, agregar
  `transition-duration: revert !important;` específico al selector
  problemático.
- **content-visibility**: si una galería se ve rara, agregar
  `content-visibility: visible` específico al item.
