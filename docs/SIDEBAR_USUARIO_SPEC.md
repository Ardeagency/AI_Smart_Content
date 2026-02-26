# Sidebar usuario consumidor – Arquitectura final

**Plataforma:** AI Smart Content  
**Alcance:** Sidebar de navegación del usuario consumidor (SaaS), no el de desarrolladores.

## Estructura general

El sidebar se divide en **2 zonas**:

- **Zona 1** → Navegación funcional del workspace (arriba, scroll si hace falta).
- **Zona 2** → Navegación organizacional / administrativa (footer anclado).

---

## Zona superior — Workspace navigation

### Header: Workspace Switcher

- Nombre del workspace.
- Tipo de plan.
- Dropdown selector.
- Siempre visible, no scrollable, contexto global.

### Navegación principal (orden fijo)

| Orden | Módulo     | Tipo UX        | Comportamiento |
|-------|------------|----------------|-----------------|
| 1     | **Production** | Página directa | No expandible. Contenido producido. Punto de entrada. |
| 2     | **flows**      | Contenedor     | Expandible. Subniveles: categorías (Posts, Reels, Stories, etc.). |
| 3     | **Identity**   | Contenedor     | Expandible. Brand, Products, Services, Audiences, Campaigns, Assets, Reglas IA. |

---

## Zona inferior — Organization control

Anclada al footer del sidebar. No se mezcla con la navegación funcional.

| Elemento                    | Tipo UX     | Descripción |
|----------------------------|------------|-------------|
| **Configuración**          | Página directa | Config global: usuarios, permisos, integraciones, branding, facturación. |
| **Planes**                 | Página directa | Gestión del plan: upgrade/downgrade, comparativa, billing. |
| **Créditos**               | Página directa | Solo compra/recarga. No muestra balance actual. |
| **Salir de la organización** | Action item | Abre modal de confirmación; luego sale del workspace (ej. vuelve a /hogar). |

---

## Reglas visuales

- **Iconografía:** 16×16 px, stroke consistente, monocromático.
- **Tipografía:** 13 px. Primarios peso 500, subitems 400.
- **Altura fila:** 36 px.
- **Spacing:** Padding horizontal 16 px, icon spacing 10 px, indent subitems 18 px.
- **Active:** Background capsule, border-radius 8 px.
- **Hover:** Background opacity 6–8 %, transition 120 ms.

---

## Comportamiento interactivo

- **Expand/Collapse:** Solo 1 contenedor expandido a la vez. Estado persistido en `localStorage` (`sidebarUserExpanded`).
- **Active state:** Enlace que coincide con la ruta actual; su contenedor (flows o Identity) se abre automáticamente.

---

## Estructura del componente

```
Sidebar
 ├── WorkspaceHeader (selector de organización)
 ├── NavigationMain (Production, flows, Identity)
 ├── Spacer (flex grow)
 └── NavigationFooter (Configuración, Planes, Créditos, Salir)
```

---

## Configuración (JSON schema)

En `js/components/Navigation.js`, `SIDEBAR_USER_CONFIG`:

- **main[]:** `type: 'page'` (Production) o `type: 'container'` (flows, Identity) con `children[]`.
- **footer[]:** Items con `label`, `icon`, `route` o `action: 'leaveWorkspace'`.

Rutas existentes se reutilizan (`/production`, `/living`, `/studio`, `/studio/flows`, `/brand`, `/products`, `/audiences`, `/campaigns`, `/content`, `/settings`, `/planes`). Créditos puede apuntar a `/credits` cuando exista la vista.

---

## Responsive

- **Desktop:** Sidebar fijo.
- **Tablet:** Sidebar overlay.
- **Mobile:** Sidebar drawer con gesto de cierre.
