# Análisis de navegación (sidebar y rutas)

## Correcciones aplicadas

### 1. Ruta **Créditos** sin registrar
- **Problema:** El sidebar tiene "Créditos" → `/credits`, pero no existía esa ruta en el router (404).
- **Solución:** 
  - Registradas rutas `/credits` y `/org/:orgId/credits`.
  - `CreditsView`: redirige a `/org/:id/organization` si hay org en contexto, sino a `/hogar`.
  - `/org/:orgId/credits` carga `OrganizationView` (donde se ven los créditos).

### 2. **Servicios** sin layout de usuario en rutas legacy
- **Problema:** En `getLayoutConfig()`, las rutas legacy que muestran sidebar de usuario no incluían `/servicios`. Al ir a `/servicios` (sin prefijo org) se mostraba sin sidebar.
- **Solución:** Añadido `/servicios` (y `/credits`) a la lista de rutas legacy para que sigan mostrando sidebar de usuario.

### 3. Título del header para Servicios
- Añadido `/servicios`: 'Identidad' en el mapa de títulos del header.

---

## Coherencias revisadas (sin cambio)

- **Estudio / Catálogo:** Estudio → Studio; Catálogo (Posts, Reels, etc.) → `studio/catalog/<slug>`. Correcto.
- **Identidad:** Marca, Productos, Servicios, Audiencias, Campañas, Assets tienen rutas propias; Reglas IA apunta a `brand` (mismo que Marca). Si en el futuro "Reglas IA" es una subsección distinta, convendría una ruta o hash propia.
- **Footer:** Configuración → organization; Planes → /planes; Créditos → /credits; Salir → acción. Correcto.
- **Developer:** Resources > "Referencias visuales" apunta a `/dev/lead/references` (ruta de lead). Usuarios no-lead que entren pueden recibir restricción según cómo esté protegida la vista; es coherente con que sea recurso de lead.

---

## Resumen de rutas sidebar usuario (con org)

| Sidebar        | Ruta final (con org)              | Vista / Comportamiento        |
|----------------|------------------------------------|-------------------------------|
| Historial      | `/org/:id/historial`               | LivingView                    |
| Estudio        | `/org/:id/studio`                  | StudioView                    |
| Catálogo > Posts, etc. | `/org/:id/studio/catalog/<slug>` | FlowCatalogView (filtrado)    |
| Marca          | `/org/:id/brand`                   | BrandsView                    |
| Productos      | `/org/:id/products`                | ProductsView                  |
| Servicios      | `/org/:id/servicios`               | ServicesView                  |
| Audiencias     | `/org/:id/audiences`               | AudiencesView                 |
| Campañas       | `/org/:id/campaigns`               | CampaignsView                 |
| Assets         | `/org/:id/content`                 | ContentView                   |
| Reglas IA      | `/org/:id/brand`                   | BrandsView (mismo que Marca)  |
| Configuración  | `/org/:id/organization`            | OrganizationView              |
| Planes         | `/planes`                          | PlanesView                    |
| Créditos       | `/credits` → redirige              | CreditsView → organization o hogar |
| Salir          | acción                             | leaveWorkspace                |
