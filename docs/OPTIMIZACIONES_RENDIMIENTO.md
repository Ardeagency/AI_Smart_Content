# Optimizaciones de rendimiento y fluidez

Medidas aplicadas para reducir lag, evitar cuelgues y que la app se sienta fluida.

---

## 1. Limpieza al cambiar de vista (Router)

- **Problema:** Al navegar a otra ruta, la vista anterior seguía con listeners en `document`/`window`, generando fugas de memoria y comportamientos raros.
- **Solución:** Antes de vaciar el container y montar la nueva vista, el router llama:
  - `currentView.onLeave()` — para que la vista detenga timers, peticiones, etc.
  - `currentView.destroy()` — para que elimine listeners globales.
- **Archivos:** `js/router.js`.

---

## 2. BaseView: cleanup de listeners

- **Problema:** Los listeners registrados con `this.addEventListener(element, event, handler)` no se eliminaban al destruir la vista.
- **Solución:** `cleanup()` recorre `this.eventListeners` y hace `removeEventListener` en cada uno. `destroy()` llama a `cleanup()`. El header del usuario (dropdown) usa `this.addEventListener(document, 'click', ...)` para que se limpie al salir.
- **Archivos:** `js/views/BaseView.js`.

---

## 3. DevBuilderView: listeners en document y debounce

- **Listeners en document:** Los handlers de `document` (cerrar menú “más”, tecla Delete en canvas) se guardan en `_documentListeners` y se eliminan en `destroy()`, evitando acumulación al entrar/salir del Builder.
- **Debounce en propiedades:** Al editar label, placeholder, descripción, etc. en el panel de propiedades, cada tecla disparaba `renderCanvas()` + `updateJsonPreview()` + `renderFooter()`, lo que generaba lag al escribir.
  - **Solución:** `onFieldChange()` marca cambios y llama a `debouncedRefreshUI()` (160 ms). El modelo se actualiza en el handler del input; solo el re-render del canvas/JSON/footer va con debounce.
- **Archivos:** `js/views/DevBuilderView.js`.

---

## 4. DevTestView: timer al salir

- **Problema:** Si se navegaba fuera de Test mientras corría un test, el `setInterval` del timer seguía activo.
- **Solución:** `onLeave()` hace `clearInterval(this.timerInterval)` y pone `timerInterval = null`.
- **Archivos:** `js/views/DevTestView.js`.

---

## 5. Utilidad de debounce

- Ya existía `window.Performance.debounce(fn, wait)` en `js/utils/Performance.js`. El Builder lo usa para el panel de propiedades. Otras vistas pueden usarlo para inputs que disparen trabajo pesado (p. ej. búsquedas, filtros).
- **Uso:** `this.debouncedFn = Performance.debounce(() => this.heavyWork(), 200);` y llamar `this.debouncedFn()` desde el input.

---

## Resumen

| Área              | Cambio                                      | Efecto                    |
|-------------------|---------------------------------------------|---------------------------|
| Router            | `onLeave()` + `destroy()` antes de nueva vista | Menos fugas, menos listeners duplicados |
| BaseView          | `cleanup()` + `destroy()` reales            | Limpieza correcta al salir |
| DevBuilderView    | `destroy()` limpia `_documentListeners`     | No se acumulan handlers en document |
| DevBuilderView    | Debounce 160 ms en actualización de UI      | Escritura fluida en propiedades |
| DevTestView       | `onLeave()` limpia `timerInterval`          | No queda timer al cambiar de ruta |

Para nuevas vistas que añadan listeners a `document` o `window`, o usen `setInterval`/`setTimeout` de larga duración, conviene implementar `onLeave()` y/o `destroy()` y registrar los handlers para poder eliminarlos.
