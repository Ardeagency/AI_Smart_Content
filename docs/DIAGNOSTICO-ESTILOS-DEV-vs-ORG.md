# Diagnóstico: Estilos y diseño dev/ vs org/

**Aplicado (corto plazo):** Variables `--dev-bg-surface` y `--dev-bg-surface-hover` en `:root`; override de `--dev-bg-card` en contenedores dev para usar superficie; Builder con header/footer/sidebars en `--bg-secondary`; `.dev-lead-content` y `.settings-section` (Builder) usan superficie.

---

## Resumen ejecutivo

El portal **dev/** (desarrolladores) presenta un **mal uso sistemático del negro** y de las variables del design system en comparación con **org/** (organizaciones). El resultado es una interfaz plana, sin jerarquía visual y con cards/secciones que se confunden con el fondo.

---

## 1. Causa raíz: variables en `:root`

En `css/bundle.css`, las variables globales definen:

```css
--bg-primary: #000000;
--bg-secondary: #141517;
--bg-card: #000000;        /* ← Problema: cards = negro puro */
--bg-tertiary: #000000;
--living-bg-deep: var(--bg-primary);
--living-bg-surface: var(--bg-secondary);
--living-bg-card: var(--bg-card);   /* → #000 */
--dev-bg-card: var(--living-bg-card); /* → #000 */
```

**Consecuencia:** Cualquier superficie que use `--bg-card` o `--dev-bg-card` es **negro sobre negro**. No hay separación visual entre “fondo de página” y “superficie de contenido”.

---

## 2. Cómo lo resuelve org/

En **org/** se usan **fallbacks explícitos** para que las superficies se vean:

| Selector | Uso |
|----------|-----|
| `.org-section` | `background: var(--living-bg-card, rgba(21, 23, 28, 0.6));` |
| `.org-modal .modal-content` | Fondos y bordes con variables glass / definidos |
| `.org-member-row` | Bordes y fondos que generan contraste |
| `.organization-container` | `background: var(--living-bg-deep, var(--bg-primary));` (fondo de página) |

**Patrón org:**  
- Fondo de página: negro (`--living-bg-deep`).  
- **Secciones y cards:** fallback `rgba(21, 23, 28, 0.6)` o equivalentes, de modo que las superficies se distinguen del fondo.

---

## 3. Qué hace mal dev/

### 3.1 Override de variables que siguen siendo negro

En el bloque de “Contenedores de vistas dev” se redefinen variables **pero siguen apuntando a negro**:

```css
.dev-dashboard-container,
.dev-flows-container,
.dev-logs-container,
.dev-test-container,
.dev-webhooks-container,
.dev-lead-container,
.builder-main,
.builder-header,
.builder-footer,
.builder-sidebar,
.builder-canvas-wrapper {
  --bg-primary: var(--living-bg-deep);   /* → #000 */
  --bg-secondary: var(--living-bg-surface); /* → #141517 */
  --bg-card: var(--living-bg-card);      /* → #000 */
  ...
}
```

**Efecto:** En todo el ámbito dev + Builder, `--bg-card` sigue siendo **#000**. No se introduce ninguna “superficie” más clara para cards o secciones.

### 3.2 Cards y secciones dev = negro sobre negro

| Componente | Variable usada | Resultado |
|------------|----------------|-----------|
| `.dev-stat-card` | `background: var(--dev-bg-card)` | Negro (#000) |
| `.dev-section` | `background: var(--dev-bg-card)` | Negro (#000) |
| `.dev-section-header` | `border-bottom: var(--dev-card-border)` | Borde visible, fondo negro |
| `.dev-flow-item:hover` | `background: rgba(255, 101, 0, 0.05)` | Algo de contraste solo en hover |
| Builder: header, footer, sidebar, canvas | `background: var(--bg-primary)` | Todo negro |

**Conclusión:** En dev no se usa **ningún** fallback tipo `rgba(21, 23, 28, 0.6)` ni equivalente. Todas las superficies “elevadas” (cards, secciones) son negro puro.

### 3.3 Builder: todo explícitamente negro

Además del override anterior, el Builder fuerza negro en todos los contenedores:

```css
#app-container:has(.builder-footer) .builder-main { background: var(--bg-primary); }
#app-container:has(.builder-footer) .builder-canvas-wrapper { background: var(--bg-primary); }
#app-container:has(.builder-footer) .builder-tab-content { background: var(--bg-primary); }
.builder-tabs-header { background: var(--bg-primary); }
.builder-footer { background: var(--bg-primary); }
.builder-sidebar { background: var(--bg-primary); }
.builder-canvas-wrapper { background: var(--bg-primary); }
```

**Efecto:** Header de pestañas, área de contenido, footer y sidebars son **el mismo negro**. Cero jerarquía visual.

### 3.4 Contenedores de página dev

Todos usan el mismo fondo profundo, sin capa intermedia:

- `.dev-dashboard-container`, `.dev-flows-container`, `.dev-logs-container`: `background: var(--living-bg-deep, var(--bg-primary));`
- `.dev-test-container`: igual
- `.dev-webhooks-container`: igual
- `.dev-lead-container`: `background: var(--bg-primary);`

Correcto para el “fondo de página”, pero si además **todas** las cards y secciones son `--dev-bg-card` (#000), no hay segundo plano (surface) diferenciado.

---

## 4. Comparativa directa org vs dev

| Aspecto | org/ | dev/ |
|--------|------|------|
| Fondo de página | `--living-bg-deep` (#000) | `--living-bg-deep` (#000) |
| Secciones / cards | `var(--living-bg-card, rgba(21, 23, 28, 0.6))` → superficie visible | `var(--dev-bg-card)` → #000, sin fallback |
| Bordes y separación | `--border-divider` en secciones | Mismos tokens, pero fondo = fondo de página |
| Header/footer/paneles | No aplica (org no tiene Builder) | Builder: todo con `--bg-primary` |
| Jerarquía visual | 2 niveles: fondo + superficie de card | 1 nivel: todo negro |

---

## 5. Listado de selectores afectados (dev/)

### 5.1 Fondos que quedan en negro sin necesidad

- `.dev-stat-card` → usa `--dev-bg-card`
- `.dev-section` → usa `--dev-bg-card`
- `.dev-section-header` → hereda fondo de sección
- `.dev-flow-item` → fondo implícito/transparente sobre negro
- `.builder-tabs-header`, `.builder-footer`, `.builder-sidebar`, `.builder-canvas-wrapper` → todos `--bg-primary`
- `.builder-config-grid` → sin fondo propio (correcto para “adaptar al tab”), pero el resto del Builder sigue todo negro

### 5.2 Variables que encadenan a negro

- `--living-bg-card` → `var(--bg-card)` → `#000`
- `--dev-bg-card` → `var(--living-bg-card)` → `#000`
- Dentro de contenedores dev, `--bg-card` se redefine a `var(--living-bg-card)` → sigue `#000`

---

## 6. Recomendaciones

### 6.1 Corto plazo (solo CSS)

1. **Introducir superficie para cards en dev**  
   Usar el mismo patrón que org: fallback en las superficies “elevadas”:
   - `.dev-stat-card`, `.dev-section`:  
     `background: var(--dev-bg-card, rgba(21, 23, 28, 0.6));`  
     o una variable nueva, p. ej. `--dev-bg-surface: rgba(21, 23, 28, 0.6);`.
2. **Builder: diferenciar barras y contenido**  
   - Header de pestañas y footer: una superficie ligeramente elevada, p. ej. `rgba(21, 23, 28, 0.8)` o `var(--bg-secondary)`.
   - Sidebars: igual que header/footer para que se lean como “paneles”.
   - Área central (canvas-wrapper / tab-content): puede seguir siendo el fondo más profundo o un tono ligeramente más claro que el del main, pero distinto de header/footer.

### 6.2 Medio plazo (design system)

1. **Definir en `:root` una variable de “superficie”**  
   Por ejemplo:  
   `--bg-surface: #141517;` o `--bg-surface: rgba(21, 23, 28, 0.6);`  
   y usarla donde hoy se usa `--bg-card` en contextos de “card” o “panel”, para no depender de `#000` para todo.
2. **Revisar `--living-bg-card` y `--dev-bg-card`**  
   Que apunten a una superficie visible (p. ej. `--bg-surface` o un gris oscuro), no a `--bg-card` si este sigue siendo `#000`.
3. **Documentar en el design system**  
   - **Nivel 0:** Fondo de página (`--bg-primary`).  
   - **Nivel 1:** Superficie de contenido (cards, secciones, paneles).  
   - **Nivel 2:** Barras (header, footer, sidebars) si se desea un tercer nivel.

### 6.3 Coherencia con org/

- Reutilizar el mismo fallback que org para “card/section”:  
  `var(--living-bg-card, rgba(21, 23, 28, 0.6))` en dev y Builder donde corresponda.
- Asegurar que **dev** use las mismas variables (o las mismas fallbacks) que **org** para secciones y modales, de modo que el tema oscuro sea uno solo y no “org con grises y dev con negro plano”.

---

## 7. Conclusión

El problema no es “usar negro” como fondo de la app, sino **usar negro para todo**: fondo de página, cards, secciones, header del Builder, footer y sidebars. En **org/** se mitiga con fallbacks que introducen una superficie intermedia; en **dev/** no existe esa capa, por lo que la jerarquía visual se pierde.

**Acción prioritaria:** Añadir una superficie distinta del negro (#000) para cards y secciones en dev (y opcionalmente para header/footer/sidebars del Builder), siguiendo el patrón ya usado en org (fallback `rgba(21, 23, 28, 0.6)` o variable `--bg-surface`).
