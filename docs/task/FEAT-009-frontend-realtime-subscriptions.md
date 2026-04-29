---
id: FEAT-009
title: Suscripciones realtime en DashboardView
severity: medium
type: feature
status: open
auto_eligible: no
auto_eligible_reason: toca UX visible — testing visual en browser necesario
est_duration: medium
created: 2026-04-29
owner: -
blocked_by: [FEAT-005]
---

# FEAT-009 · Realtime en DashboardView

## Objetivo

Que los widgets se actualicen **sin reload** cuando llegan datos nuevos a las tablas críticas. Aprovechar el realtime habilitado en FEAT-005.

## Patrón

```js
class DashboardView extends BaseView {
  // ...
  _channels = []; // Guardar referencias para limpiar en onLeave

  _subscribeRealtime() {
    if (!this._supabase || !this._orgId) return;

    // Vera Pending Actions → Estrategia
    this._channels.push(
      this._supabase
        .channel(`dash-vpa-${this._orgId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'vera_pending_actions',
          filter: `organization_id=eq.${this._orgId}`
        }, (payload) => this._handleVpaChange(payload))
        .subscribe()
    );

    // Brand Vulnerabilities → Mi Marca + Estrategia
    this._channels.push(
      this._supabase
        .channel(`dash-vuln-${this._orgId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'brand_vulnerabilities',
          filter: `organization_id=eq.${this._orgId}`
        }, (payload) => this._handleVulnChange(payload))
        .subscribe()
    );

    // Body Missions → Estrategia (historial + briefing)
    this._channels.push(
      this._supabase
        .channel(`dash-bm-${this._orgId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'body_missions',
          filter: `organization_id=eq.${this._orgId}`
        }, (payload) => this._handleMissionChange(payload))
        .subscribe()
    );

    // Intelligence Signals → Tendencias + Mi Marca (Shadow Mentions)
    // CUIDADO: filter por entity_id_in en vez de organization_id (la tabla no tiene esa col)
    if (this._entityIds?.length) {
      const filter = `entity_id=in.(${this._entityIds.join(',')})`;
      this._channels.push(
        this._supabase
          .channel(`dash-sig-${this._orgId}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'intelligence_signals', filter
          }, (payload) => this._handleSignalChange(payload))
          .subscribe()
      );
    }

    // Retail Prices → Competencia
    this._channels.push(
      this._supabase
        .channel(`dash-rp-${this._orgId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'retail_prices',
          filter: `organization_id=eq.${this._orgId}`
        }, (payload) => this._handlePriceChange(payload))
        .subscribe()
    );

    // Trend Topics → Tendencias
    this._channels.push(
      this._supabase
        .channel(`dash-tt-${this._orgId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'trend_topics',
          filter: `organization_id=eq.${this._orgId}`
        }, (payload) => this._handleTrendChange(payload))
        .subscribe()
    );
  }

  _unsubscribeRealtime() {
    for (const ch of this._channels) {
      try { ch.unsubscribe(); } catch (_) {}
    }
    this._channels = [];
  }

  // Handlers — actualizan caché local + re-render del widget afectado
  _handleVpaChange(p) {
    if (!this._stratData) return;
    const evt = p.eventType; // INSERT | UPDATE | DELETE
    const row = p.new || p.old;
    // Mutate this._stratData.actions y re-render solo esa zona
    // ...
  }

  // ... resto handlers ...

  // En onLeave:
  onLeave() {
    this._unsubscribeRealtime();
    this._destroyCharts();
  }
}
```

## Consideraciones

- **Filtro de intelligence_signals**: la tabla no tiene `organization_id`. Usar `entity_id=in.(...)`. Limitación: si hay muchas entities, el filter puede ser largo. Si supera el límite, suscribirse sin filter y filtrar en cliente.
- **Cleanup**: `unsubscribe()` en `onLeave()` es esencial para no acumular channels al cambiar de view.
- **Re-renders parciales**: idealmente cada handler solo re-renderiza el widget afectado, no toda la página. Esto requiere que cada widget tenga un id estable y un método de update.

## Pasos

1. Resolver [FEAT-005](./FEAT-005-extend-realtime-publication.md) (publication extendida).
2. Implementar `_subscribeRealtime()` y `_unsubscribeRealtime()` en `DashboardView`.
3. Implementar los handlers (uno por tipo de cambio).
4. Probar:
   - Abrir dashboard.
   - INSERT manual en `brand_vulnerabilities` desde SQL Editor.
   - Verificar que el widget se actualiza sin recargar.

## Criterio de done

- Dashboard reacciona a INSERT/UPDATE en las 7 tablas sin reload.
- Channels se cierran limpios al cambiar de view (no warnings de "channel ya cerrado").
- Performance: < 100ms de latencia entre INSERT y update visual.
