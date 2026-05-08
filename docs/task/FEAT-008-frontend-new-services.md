---
id: FEAT-008
title: Crear CompetenciaDataService y TendenciasDataService
severity: medium
type: feature
status: open
auto_eligible: no
auto_eligible_reason: requiere diseño visual de widgets nuevos — decisión humana
est_duration: long
created: 2026-04-29
updated: 2026-05-05
owner: -
---

> **Nota 2026-05-05**: FEAT-006 ya cerrada → sin bloqueadores. Actualización de scope: `js/services/CompetenciaDataService.js` (5.9 KB) **ya existe** desde 2026-04-30. Solo falta crear `TendenciasDataService.js` y conectar ambos services al render.

# FEAT-008 · Services frontend nuevos

## Objetivo

El tab Tendencias del `DashboardView` no tiene su propio service. Crear:

- ~~`js/services/CompetenciaDataService.js`~~ ✅ ya existe (verificar que use el RPC `dashboard_competencia` y no queries individuales)
- `js/services/TendenciasDataService.js` 🚧 falta crear

## Plantilla

Mirror exacto de `MiBrandaDataService` post-refactor (FEAT-007), una llamada al RPC correspondiente:

```js
class CompetenciaDataService {
  constructor() {
    this.sb = null;
    this.orgId = null;
    this.containerIds = [];
    this.entityIds = [];
  }

  async init(supabase, orgId) {
    this.sb = supabase;
    this.orgId = orgId;
    // Cargar IDs base (igual que MiBrandaDataService)
    return this;
  }

  async loadAll(window = 30, sections = null) {
    const { data, error } = await this.sb.rpc('dashboard_competencia', {
      p_org_id: this.orgId,
      p_window_d: window,
      p_sections: sections
    });
    if (error) return { error };
    return data; // { precios, narrativa, vulnerabilidades, inversion }
  }
}
window.CompetenciaDataService = CompetenciaDataService;
```

## Cambios en DashboardView

`_renderCompetence(body)` y `_renderTendencies(body)` hoy probablemente son stubs. Después de tener los services, implementar:

```js
async _ensureCompetenciaService() {
  if (this._compService) return;
  if (!window.CompetenciaDataService) {
    await this.loadScript('/js/services/CompetenciaDataService.js', 'CompetenciaDataService');
  }
  this._compService = await new window.CompetenciaDataService().init(this._supabase, this._orgId);
}

async _renderCompetence(body) {
  body.innerHTML = this._buildCompetenceSkeleton();
  await Promise.allSettled([this._ensureChartJs(), this._ensureCompetenciaService()]);
  if (!this._compData) {
    this._compData = await this._compService?.loadAll();
  }
  body.innerHTML = this._buildCompetenceHTML(this._compData);
  this._initCompetenceCharts(this._compData);
}
```

## Pasos

1. ~~Resolver FEAT-006~~ ✅ cerrada el 2026-04-30.
2. Auditar `CompetenciaDataService.js` existente: confirmar que usa `supabase.rpc('dashboard_competencia', ...)` y no queries individuales.
3. Crear `TendenciasDataService.js` (mirror de Competencia, llamando `dashboard_tendencias`).
4. Implementar `_renderCompetence` y `_renderTendencies` en `DashboardView`.
5. Diseñar widgets HTML según los specs (`/docs/DASHBOARD-MI-COMPETENCIA.txt` y `/docs/DASHBOARD-TENDENCIAS.txt`).
6. Push y validar visualmente.

## Criterio de done

- Los 2 services existen y exponen `loadAll()`.
- Los tabs renderizan widgets con datos reales.
- Los 4 dashboards (Mi Marca, Competencia, Tendencias, Estrategia) tienen el mismo nivel de completitud.
