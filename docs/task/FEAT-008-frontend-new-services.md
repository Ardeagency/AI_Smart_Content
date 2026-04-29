---
id: FEAT-008
title: Crear CompetenciaDataService y TendenciasDataService
severity: medium
type: feature
status: open
created: 2026-04-29
owner: -
blocked_by: [FEAT-006]
---

# FEAT-008 · Services frontend nuevos

## Objetivo

Los tabs Mi Competencia y Tendencias del `DashboardView` no tienen su propio service todavía. Crear:

- `js/services/CompetenciaDataService.js`
- `js/services/TendenciasDataService.js`

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

1. Resolver [FEAT-006](./FEAT-006-dashboard-rpcs-remaining.md).
2. Crear `CompetenciaDataService.js` y `TendenciasDataService.js`.
3. Implementar `_renderCompetence` y `_renderTendencies` en `DashboardView`.
4. Diseñar widgets HTML según los specs (`/docs/DASHBOARD-MI-COMPETENCIA.txt` y `/docs/DASHBOARD-TENDENCIAS.txt`).
5. Push y validar visualmente.

## Criterio de done

- Los 2 services existen y exponen `loadAll()`.
- Los tabs renderizan widgets con datos reales.
- Los 4 dashboards (Mi Marca, Competencia, Tendencias, Estrategia) tienen el mismo nivel de completitud.
