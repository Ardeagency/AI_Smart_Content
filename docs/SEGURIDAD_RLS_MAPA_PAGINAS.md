# Mapa de seguridad RLS por página

Este documento relaciona cada página/vista de la plataforma con las tablas de Supabase que usa y qué políticas RLS deben aplicar.

## Resumen de hallazgos

- **Hogar** (`/hogar`): organizaciones, miembros, créditos de org, marcas, suscripciones → necesita políticas para `organizations`, `organization_members`, `organization_credits`, `brand_containers`, `brands`, `profiles`, `subscriptions`.
- **Otras páginas** usan más tablas que no tenían RLS o políticas definidas (ver tabla abajo).

## Tablas con RLS activado pero sin política (acceso denegado)

| Tabla | Usado en | Acción |
|-------|----------|--------|
| `storage_usage` | (backend/org) | Añadir política: solo miembros de la org pueden leer su fila. |
| `developer_notifications` | DevBuilderView (insert) | Añadir: lectura/actualización por `recipient_user_id`; insert por flujo. |
| `flow_collaborators` | Evaluación en política de `content_flows` | Añadir SELECT para autenticados (el filtro real está en content_flows). |
| `flow_modules` | DevTestView, DevBuilderView, DevWebhooksView | Añadir: acceso si el flow padre es accesible. |
| `runs_inputs` / `runs_outputs` | living.js, runs de flujos | Añadir: acceso por `run_id` cuando el run es del usuario o dev. |

## Tablas que la app usa y no tenían RLS ni políticas

| Tabla | Usado en | Política necesaria |
|-------|----------|--------------------|
| `brands` | HogarView, BrandsView, form-record, living, data-collector | Mismo criterio que `brand_containers` (owner/org/dev). |
| `brand_assets` | BrandsView, form-record | Por `brand_container_id` (owner/org/dev). |
| `campaigns` | campaigns-manager, form-record | Por `brand_container_id` (owner/org/dev). |
| `credit_usage` | BrandsView, living.js | Usuario ve sus filas; ver por org si `organization_id` y es miembro. |
| `organization_credits` | HogarView, Navigation, StudioView, BrandsView | Solo miembros de la org pueden leer/actualizar. |
| `product_images` | ProductsView, products.js, form-record | Acceso vía producto → brand_container (owner/org/dev). |
| `subscriptions` | HogarView | Solo el propio usuario (`user_id = auth.uid()`). |
| `profiles` | HogarView, Navigation, AuthService, BaseView, landing, login, form-record, products, living | Solo propio perfil (`id = auth.uid()`). Tabla unificada de usuarios. |

## Mapa página → tablas

| Página / Ruta | Tablas que lee/escribe |
|---------------|-------------------------|
| **Hogar** `/hogar` | organizations, organization_members, organization_credits, brand_containers, user_profiles, users, subscriptions, brands, brand_colors |
| **Brands** `/org/:id/brands`, etc. | brand_containers, brands, products, brand_assets, brand_entities, brand_places, audiences, brand_colors, brand_rules, organization_members, organization_credits, credit_usage |
| **Products** | products, product_images, brand_containers |
| **Campaigns** | campaigns |
| **Studio** | organization_credits, content_flows |
| **Living** | profiles, brand_containers, products, flow_runs, runs_outputs, credit_usage, brands |
| **Content / Catálogo** | content_categories, content_subcategories, content_flows, user_flow_favorites, flow_runs |
| **Create** | (depende del flujo) |
| **Form Record** | profiles, brand_containers, brands, brand_assets, brand_core (storage), products, product_images, campaigns |
| **Settings** | profiles |
| **Dev Dashboard** | developer_stats, content_flows, flow_runs, developer_logs |
| **Dev Flows / Builder / Test / Webhooks** | content_flows, flow_technical_details, flow_modules, flow_runs, developer_logs, developer_notifications, ui_component_templates |
| **Dev Lead (Categories, Schemas, References, etc.)** | content_categories, content_subcategories, content_flows, ui_component_templates, visual_references, profiles |
| **Login / Auth** | profiles, brand_containers |
| **Navigation** | organizations, profiles, organization_credits, organization_members, flow_runs, user_flow_favorites |

## Tablas de esquema que deben tener RLS

Todas las tablas de datos de negocio que usa la app deben tener RLS activado y al menos una política que permita el acceso necesario. Las funciones helper `is_developer()` y `is_org_member()` usan `SECURITY DEFINER` y leen `profiles` y `organization_members`; es correcto que esas tablas tengan sus propias políticas (cada uno su fila / org), y las funciones siguen funcionando porque se ejecutan con privilegios del definer.

## Recomendación

- Aplicar el script actualizado `SQL/security_RLS.sql` que incluye:
  1. Activar RLS en: `brands`, `brand_assets`, `campaigns`, `credit_usage`, `organization_credits`, `product_images`, `subscriptions`, `profiles`.
  2. Políticas para todas las tablas anteriores.
  3. Políticas para tablas que ya tenían RLS pero sin política: `storage_usage`, `developer_notifications`, `flow_collaborators`, `flow_modules`, `runs_inputs`, `runs_outputs`, `ai_brand_vectors` (si se usan en backend).

Después de aplicar el script, probar en cada página que los datos cargan y que no aparecen datos de otras organizaciones o usuarios.
