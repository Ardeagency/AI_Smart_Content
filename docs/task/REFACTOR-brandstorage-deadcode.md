---
id: REFACTOR-brandstorage
title: BrandstorageView — estado cargado pero nunca leido
severity: low
type: refactor
status: open
auto_eligible: yes
auto_eligible_reason: eliminacion de estado muerto verificable por grep, sin cambio de UI
est_duration: medium
created: 2026-05-26
---

# REFACTOR: BrandstorageView — dead state

Heredado del cierre de `REFACTOR-brand-organization-deadcode` (2026-05-26). La vista
hermana arrastra la misma deuda: estado inicializado y cargado en `loadData` pero
nunca consumido por ningun render.

## Sintoma

`js/views/BrandstorageView.js:16-27` declara e hidrata propiedades que ningun
`render*()` lee.

## Pasos para resolver

1. Verificar por grep que cada candidato solo aparece como asignacion (init/reset/load),
   nunca como lectura, en `BrandstorageView.js` y en `js/views/brandstorage/`:
   - `products`, `organizationMembers`, `organizationCredits`, `creditUsage`,
     `brandIntegrations`, `brandSocialLinks`, `brandRules`.
   - OJO: a diferencia de BrandOrganizationView, aqui `brand_entities`/`brand_places`
     SI se usan (lista de Productos, modales). NO tocar el cluster de entidades.
2. Eliminar init en constructor + queries en `loadData` + resets de los que confirmen
   muertos.
3. Reducir los `select(...)` de las queries que sigan vivas a las columnas leidas.

## Criterio de done

`grep -nE "this\.(products|organizationMembers|organizationCredits|creditUsage|brandIntegrations|brandSocialLinks|brandRules)\b" js/views/BrandstorageView.js`
solo devuelve lecturas legitimas o nada; `node --check` pasa; la vista renderiza igual.
