---
id: FEAT-007
title: Refactor MiBrandaDataService + StrategiaDataService → 1 RPC
severity: medium
type: feature
status: open
created: 2026-04-29
owner: -
blocked_by: [FEAT-006]
---

# FEAT-007 · Refactor frontend services para 1 RPC

## Objetivo

Hoy `MiBrandaDataService.js` ejecuta ~15 queries paralelas con `Promise.allSettled`. `StrategiaDataService.js` ejecuta ~10. Cambiar a una **única llamada** `supabase.rpc('dashboard_X', { p_org_id })`.

## Beneficios

- 1 round-trip en lugar de 15.
- Coherencia transaccional (todos los datos del mismo instante).
- Menos código frontend, lógica en SQL.
- Más fácil cachear / invalidar.

## Patrón propuesto

```js
class MiBrandaDataService {
  // ... constructor ...

  async init(supabase, orgId) { /* sigue cargando containerIds, entityIds */ }

  async loadAll(window = 30, sections = null) {
    const { data, error } = await this.sb.rpc('dashboard_mi_marca', {
      p_org_id: this.orgId,
      p_window_d: window,
      p_sections: sections
    });
    if (error) return { error };
    // Adaptar la forma para que las claves sigan siendo lo que el view espera
    return {
      kpis: data.header,
      ritmo: data.operatividad?.ritmo,
      heatmap: data.operatividad?.heatmap,
      formatos: data.operatividad?.formatos,
      // ... mapping al shape antiguo ...
    };
  }
}
```

## Mantener compatibilidad

`DashboardView.js` consume `loadAll()` esperando ciertas keys. El refactor debe mantener esas keys o el view rompe. Dos opciones:

A. **Adapter**: `loadAll()` mapea data del RPC al shape antiguo (preferido, menos cambios en view).

B. **Cambiar view**: refactor también `DashboardView` para consumir las nuevas keys.

Voto: A primero, B en una segunda iteración cuando las claves nuevas estén estables.

## Pasos

1. Resolver [FEAT-006](./FEAT-006-dashboard-rpcs-remaining.md) (RPCs aplicadas).
2. Refactor `MiBrandaDataService.js`:
   - Reemplazar todas las queries individuales por una sola `supabase.rpc(...)`.
   - Adapter para mantener shape de retorno.
   - Mantener `init()` que carga `containerIds`/`entityIds` (algunos métodos pequeños como `loadShadowMentions` pueden mantenerse para refresh independiente).
3. Idem `StrategiaDataService.js`.
4. Probar en browser que dashboards siguen renderizando idénticos.

## Criterio de done

- `MiBrandaDataService.loadAll()` hace 1 RPC.
- DashboardView Mi Marca renderiza igual que antes (visualmente idéntico).
- Network tab muestra 1 request en lugar de ~15.
- Carga total < 200ms.
