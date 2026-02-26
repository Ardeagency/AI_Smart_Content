# Análisis de css/bundle.css

**Archivo:** `css/bundle.css` (~20.305 líneas)  
**Fecha:** Febrero 2026

---

## 1. Código roto / referencias inexistentes

### 1.1 Keyframes usados pero no definidos
- **`shimmer`**: usado en `.auth-card::before` (línea ~19813) con `animation: shimmer 2s infinite;`.  
  Comentario dice "Animación shimmer movida a base.css" pero **no existe** en el bundle → la animación no hace nada.
- **`fadeInScale`**: usado en `.auth-card` (línea ~19801) con `animation: fadeInScale 1s ease-out 0.2s both;`.  
  **No hay `@keyframes fadeInScale`** en el archivo → la animación no se aplica.

**Acción:** Añadir `@keyframes shimmer` y `@keyframes fadeInScale` en el bundle (o eliminar las referencias si ya no se quieren).

---

## 2. Código duplicado

### 2.1 Checkbox personalizado (duplicado completo)
- **Primera definición (payment-modal):** líneas ~19599-19644  
  - `.checkbox-container`, `.checkmark`, estados `:hover` y `:checked + .checkmark`  
  - Usa `--accent-cta`, `input[type="checkbox"]:checked + .checkmark`
- **Segunda definición (login.css):** líneas ~19960-20016  
  - Misma estructura, estilos distintos  
  - Usa `--accent-yellow`, `input:checked ~ .checkmark`, `rgba(42,42,42,0.7)` para fondo

El segundo bloque sobrescribe al primero (mismo selector). Resultado: en payment modal el checkbox puede verse con estilos de login (accent-yellow en vez de accent-cta).

**Acción:** Unificar en una sola definición usando variables (por ejemplo `--checkbox-accent`) o clases contextuales (`.payment-modal .checkbox-container` / `.auth-card .checkbox-container`).

### 2.2 `.form-row` definido varias veces
- ~16845: `.dev-lead-modal .form-row` (flex, gap 16px)
- ~18568: `.form-row` global (grid 1fr 1fr, gap 16px)
- ~19199: `.form-row` (grid 1fr 1fr, gap 1rem)
- ~19838: `.form-row` en login (grid 1fr 1fr, gap 15px, margin-bottom 20px)
- Dentro de media queries (768px, 480px): override a 1 columna

Múltiples definiciones globales de `.form-row` con valores muy similares (grid 2 columnas). Riesgo de especificidad y mantenimiento.

**Recomendación:** Una sola definición base de `.form-row` y, si hace falta, variantes con clase (ej. `.form-row--narrow`) o contexto (`.auth-form .form-row`).

### 2.3 `.login-modal` y `.login-card`
- **Sistema de diseño (líneas ~394-408):** `.login-modal` en grupo con otros modales (display none, position fixed, etc.).
- **landing.css (~3604):** `.login-modal` vuelve a definir `display: none`, `position: fixed`, etc.
- **.login-card:** definida en landing (~3625) y de nuevo en media query (~3859).

Parte de las propiedades de `.login-modal` están duplicadas; `.login-card` se repite con pequeños cambios en responsive.

---

## 3. Código residual / desactualizado

### 3.1 Indentación incorrecta en media 480px (payment)
Líneas ~19738-19755: dentro de `@media (max-width: 480px)` aparecen:
- `.form-section { margin-bottom: 1.5rem; }`
- `.section-title { font-size: ...; margin-bottom: 1rem; }`

Con indentación inconsistente (`.section-title` tiene `margin-bottom` con menos espacios). Funcionalmente están dentro del media, pero los nombres son genéricos y podrían afectar a otras vistas.

### 3.2 Variables CSS redundantes en `:root`
Alias que solo apuntan a otra variable (más uso de tokens, pero más líneas):
- `--success-color: var(--color-success);`
- `--warning-color: var(--color-warning);`
- `--error-color: var(--color-error);`
- `--info-color: var(--color-info);`

Si se quiere un solo nombre estándar, se puede usar solo `--color-success` etc. y sustituir en los 20+ usos de `--success-color` (y análogos). Opcional para limpieza.

### 3.3 Prefijos de vendor
Unas **100** apariciones de `-webkit-`, `-moz-`, `-ms-`.  
Algunos siguen siendo útiles (p. ej. `-webkit-backdrop-filter`, `-webkit-font-smoothing`). Revisar si en los navegadores que soportas ya basta con la propiedad estándar y eliminar prefijos innecesarios para reducir tamaño.

---

## 4. Estilos repetitivos / posibles consolidaciones

- **`background: var(--glass-bg)`** y **`background: var(--bg-card)`**: ~86 y muchas más repeticiones. Ya se usan tokens; poco margen de reducción sin cambiar estructura.
- **`border-radius: 8px|12px|14px`** (valores “mágicos”): ~14 veces. Preferible usar siempre `var(--radius-sm)`, `var(--radius-md)`, `var(--glass-radius)` para alinearse al design system.

---

## 5. Otros

- **66 usos de `!important`**: repartidos por el archivo. Revisar si son necesarios (overrides de utilidades, compatibilidad) o si se pueden sustituir por mejor especificidad/clases.
- **Comentarios de “X lineas”** (ej. “navigation.css (2595 lineas)”): informativos; no afectan al rendimiento.

---

## Resumen de prioridades

| Prioridad | Problema | Acción sugerida |
|-----------|----------|------------------|
| Alta | Keyframes `shimmer` y `fadeInScale` ausentes | Añadir keyframes o quitar animaciones |
| Alta | Duplicado `.checkbox-container` / `.checkmark` | Unificar con variables o contexto |
| Media | Indentación/scope `.form-section` / `.section-title` en 480px | Corregir indentación y valorar scope (ej. `.payment-modal`) |
| Media | Múltiples `.form-row` globales | Una definición base + variantes por contexto/clase |
| Baja | Variables alias `--success-color` etc. | Opcional: unificar a `--color-*` |
| Baja | Prefijos vendor / `!important` | Revisión gradual |

Si quieres, el siguiente paso puede ser aplicar en el bundle solo los cambios de prioridad alta (keyframes + checkbox unificado) e indentación del media 480px.
