---
id: OPS-006
title: Meta Ad Library — decidir path A (Meta App Review) / B (Apify actor) / C (pausar)
severity: medium
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere decisión sobre solicitar permisos a Meta vs consolidar en Apify
est_duration: medium
created: 2026-05-05
updated: 2026-05-05
owner: -
---

# OPS-006 · Meta Ad Library — decidir path

## Estado actual (2026-05-05)

**Cleanup técnico ya aplicado:** el fallback legacy `scrapeAdLibraryPublic()` quedaba referenciado en `social-scraper.service.js` y producía `Cannot read properties of undefined (reading 'length')` cada vez que la API de Meta devolvía `permission denied`. La función `runMetaAdLibrarySync()` se editó para que cuando la API falle por permisos, registre warning y haga skip — sin invocar el stub roto. Ya no hay errores `Cannot read properties of undefined` en logs. Servicio `ai-engine` reiniciado vía systemd.

Estado de los datos:
- `competitor_ads` sigue **vacío** (sin path operativo a Meta Ad Library).
- Sensor `meta_ad_library_sync` sigue **active** en `monitoring_triggers`. Corre, falla por permisos, registra `sensor_runs.status='success'` (no produjo filas, pero no crashea).

## Decisión pendiente

### Opción A — Meta App Review oficial (`ads_read`)

1. Meta App Dashboard → App Review → Permissions and Features.
2. Solicitar `ads_read` y `ads_management_standard_access`.
3. Submit con video demo + business verification.
4. Tiempo de revisión: 5-15 días hábiles.
5. Costo: $0, requiere app en modo "Live" + business verificado.

### Opción B — Apify Meta Ad Library actor

1. Buscar actor en Apify Store: `https://console.apify.com/store?search=meta+ad+library` (ej. `apify/meta-ads-library-scraper`).
2. Probar manualmente con 3-5 competidores conocidos.
3. Registrar el actor en `scraper_actors`:
   ```sql
   INSERT INTO scraper_actors (platform, name, apify_actor_id, cost_per_run, ...)
   VALUES ('meta_ad_library', 'apify/meta-ads-library-scraper', '<actor_id>', ...);
   ```
4. Actualizar `runMetaAdLibrarySync()` en `social-scraper.service.js` para invocar `apify.client.runActor()` con el nuevo actor en lugar de `getMetaAdLibrary()`.
5. Costo: ~$0.10–0.50 por run según volumen, descontado de `organization_credits`.

### Opción C — Pausar el sensor

```sql
UPDATE monitoring_triggers
SET status = 'paused'
WHERE sensor_type = 'meta_ad_library_sync';
```

Útil si la decisión A/B se difiere a una fase posterior. Reversible con `SET status='active'`.

## Recomendación

**Opción B** si hay urgencia por tener data de ads competidoras. Es 100% controlable desde nuestro lado (sin esperar a Meta) y se integra al modelo Apify ya operativo.

Si no hay urgencia: **Opción C** y postergar.

## Criterio de done

- (A o B) `competitor_ads` recibe ≥1 fila en 24-48h tras configurar competidores (DATA-001).
- (C) `monitoring_triggers.status='paused'` y nota en este archivo de fecha de re-evaluación.
- 0 errores `Application does not have permission` o `Cannot read properties of undefined` en `journalctl -u ai-engine` durante 7 días.
