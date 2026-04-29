---
id: FEAT-005
title: Habilitar realtime en 7 tablas más
severity: medium
type: feature
status: open
created: 2026-04-29
owner: -
---

# FEAT-005 · Extender realtime publication

## Objetivo

Hoy `supabase_realtime` solo cubre `vera_pending_actions`, `ai_messages`, `ai_conversations`, `user_notifications`. Para que los dashboards sean **vivos** (sin reload), agregar las 7 tablas críticas:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_vulnerabilities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.intelligence_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.body_missions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.retail_prices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitor_ads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trend_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitoring_triggers;
```

## Consideración importante

Realtime respeta RLS. Cada cliente solo recibe filas para las que tiene policy de SELECT. Esto está bien, pero **`intelligence_signals` no tiene `organization_id`** — su RLS depende del JOIN a `intelligence_entities`. El filtro realtime puede ser más complejo:

```js
// En vez de filter directo:
.on('postgres_changes', { ... filter: `organization_id=eq.${orgId}` })

// Posiblemente:
.on('postgres_changes', { ... filter: `entity_id=in.(${entityIds.join(',')})` })
```

Verificar al implementar el frontend (FEAT-009).

## Pasos

1. Aplicar los `ALTER PUBLICATION` via Mgmt API.
2. Verificar:
   ```sql
   SELECT tablename FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
   ORDER BY tablename;
   ```
3. Probar suscripción desde browser dev tools:
   ```js
   const ch = supabase.channel('test')
     .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_vulnerabilities' },
         p => console.log(p))
     .subscribe();
   // Insertar una row → debería aparecer evento
   ```

## Criterio de done

- 11 tablas en `pg_publication_tables` (4 actuales + 7 nuevas).
- INSERT de prueba en cada tabla dispara evento al cliente suscrito.
- [FEAT-009](./FEAT-009-frontend-realtime-subscriptions.md) puede consumir los eventos.
