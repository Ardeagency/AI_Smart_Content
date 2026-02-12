# Sidebar usuario consumidor – Especificación técnica

**Plataforma:** AI Smart Content  
**Alcance:** Sidebar de navegación del usuario consumidor (SaaS), no el de desarrolladores.

## Objetivo

- Reducir complejidad cognitiva.
- Escalar arquitectura multi-tenant.
- Mantener consistencia visual minimalista.
- Render dinámico desde configuración (JSON/JS).
- Soportar crecimiento futuro (módulos, marketplace, AI agents).

## Principios de diseño

1. **Workflow-Based Navigation:** Configuración → Creación → Automatización → Activación → Análisis.
2. **Máximo 1 nivel de nesting:** Menu → Submenu ✓ (no Subsubmenu).
3. **Sidebar = navegación primaria;** subnavegación en breadcrumb, tabs o panels.
4. **Jerarquía plana:** máx. 6 módulos principales, máx. 5 subitems por módulo.

## Estructura del sidebar

### Level 0 – Workspace context (arriba)

- Workspace selector (organización).
- Tipo de plan.
- Estado del workspace.

### Level 1 – Navegación principal (orden fijo)

| Orden | Módulo      | Descripción breve                |
|-------|-------------|-----------------------------------|
| 1     | **Actividad** | Vista operacional del workspace (antes "Living") |
| 2     | Foundation  | ADN estructural del contenido     |
| 3     | Creation    | Producción de contenido           |
| 4     | Automations | Orquestación de flujos IA         |
| 5     | Campaigns   | Distribución y activación         |
| 6     | Analytics   | Insights y métricas               |

### Level 2 – Sub navegación

- **Actividad:** Overview, Recent Content, Active Automations, Campaign Performance, Notifications.
- **Foundation:** Brand, Products, Services, Assets & Guidelines, AI Rules.
- **Creation:** Studio, UGC Production, Prompt Builder.
- **Automations:** Flow Library, Active Flows, Flow Builder, Integrations.
- **Campaigns:** Audiences, Campaign Manager, Distribution.
- **Analytics:** Content Performance, Audience Insights, ROI Dashboards.

## Configuración (config-driven)

El menú se genera desde `SIDEBAR_USER_CONFIG` en `js/components/Navigation.js`. Cada grupo tiene:

- `id`, `label`, `icon` (clase Font Awesome), `type: 'group'`
- `items[]`: `id`, `label`, `route` (sufijo respecto a `basePath`, ej. `living`, `studio/catalog`).

Rutas actuales se mantienen (`/living`, `/brand`, `/products`, etc.); solo cambian labels y agrupación.

## Reglas visuales (CSS)

- **Width:** Expanded 260px, Collapsed 72px (solo iconos + tooltip).
- **Spacing:** Altura ítem 44px, espacio entre grupos 16px, icono 20px, label 14px.
- **Active:** Capsule highlight, border-radius 10px.
- **Hover:** Background opacity 8%, transition 150ms ease.
- **Tipografía:** Primarios 500, subitems 400.

Design tokens en `css/navigation.css`:

- `--sidebar-background`, `--sidebar-hover`, `--sidebar-active`
- `--sidebar-icon-color`, `--sidebar-text-primary`, `--sidebar-text-secondary`

## Comportamiento interactivo

- **Un solo grupo expandido** a la vez (al abrir uno se cierran los demás).
- **Ruta actual:** marca `active` el subitem correspondiente y abre su grupo (`submenu-open`).
- **Tooltip** obligatorio cuando el sidebar está colapsado.
- **Navegación:** clic en subitem usa History API (`router.navigate`); el toggle del grupo solo expande/colapsa.

## Responsive

- **Desktop:** Sidebar fijo.
- **Tablet:** Sidebar overlay colapsable.
- **Mobile:** Sidebar drawer.

## Accesibilidad

- Navegación por teclado.
- ARIA en grupos (`aria-expanded`, `aria-controls`, `role="group"`).
- Focus visible, contraste AA.

## Cambio de nombre Living → Actividad

- **Label en sidebar:** "Living" sustituido por "Actividad" como primer módulo.
- **Header:** Título por defecto y para la ruta `/living` es "Actividad".
- **URL:** Se mantiene `/living` (y `/org/:id/living`) para no romper rutas ni bookmarks.
