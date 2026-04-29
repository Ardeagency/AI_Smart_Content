---
id: DATA-001
title: Faltan intelligence_entities competidoras → 4 tablas vacías
severity: high
type: data
status: open
auto_eligible: no
auto_eligible_reason: requiere input del usuario sobre qué marcas son competidoras reales
est_duration: short
created: 2026-04-29
owner: -
---

# DATA-001 · Configurar entidades competidoras

## Síntoma

Las tablas `competitor_ads`, `retail_prices`, `url_watchers`, `visual_references` están **completamente vacías** pese a que los sensores `meta_ad_library_sync`, `social`, `meta_page_insights` corren con `status='success'` cada día.

Causa: solo hay **7 filas** en `intelligence_entities`, ninguna probablemente configurada como competidor real (con `domain` apropiado y `target_identifier` válido).

Sin entities competidoras configuradas, los scrapers corren pero no tienen target → escriben 0 filas.

## Evidencia

```sql
SELECT count(*) FROM competitor_ads;     -- 0
SELECT count(*) FROM retail_prices;      -- 0
SELECT count(*) FROM url_watchers;       -- 0
SELECT count(*) FROM visual_references;  -- 0

SELECT count(*) FROM intelligence_entities;  -- 7

-- Detalle de las 7 actuales
SELECT id, name, domain, target_identifier, metadata
FROM intelligence_entities
WHERE organization_id = 'a1000000-0000-0000-0000-000000000001';
```

## Acción requerida (input del usuario)

Para resolver esta tarea **necesitamos los datos de los competidores reales** de Arde / del cliente. Específicamente:

| Campo | Ejemplo | Tipo |
|---|---|---|
| `name` | "Coca-Cola" | text |
| `domain` | `social` / `marketplace` / `web` / `news` / `analytics` | text (CHECK) |
| `target_identifier` | `@cocacola` (IG) / `B0XXXXXXXX` (Amazon ASIN) / `cocacola.com` (web) | text |
| `metadata` | `{ "es_competidor": true, "category": "soft drinks", "country": "CO" }` | jsonb |

## Pasos para resolver

1. Reunir lista de competidores con el cliente (3–5 mínimos para arrancar).
2. Para cada competidor decidir qué dominios vigilar (social account, marketplace ASIN/SKU, web URL).
3. Insertar en `intelligence_entities`:
   ```sql
   INSERT INTO intelligence_entities (
     brand_container_id, organization_id, name, domain, target_identifier, metadata
   ) VALUES
     ('<brand_id>', '<org_id>', 'Competidor X (IG)', 'social', '@competidor_x', '{"es_competidor": true}'),
     ('<brand_id>', '<org_id>', 'Competidor X (Amazon)', 'marketplace', 'B0ABCDEFGH', '{"es_competidor": true, "retailer": "amazon"}'),
     ('<brand_id>', '<org_id>', 'Competidor Y (web)', 'web', 'https://competidor-y.com', '{"es_competidor": true}');
   ```
4. El trigger `fn_intelligence_entities_after_insert` debería disparar provisioning automático de sensores per-entity (`fn_provision_trigger_for_entity`).
5. Verificar en `monitoring_triggers` que aparecen los sensores nuevos:
   ```sql
   SELECT sensor_type, count(*) FROM monitoring_triggers
   WHERE entity_id IN (<new_ids>) GROUP BY sensor_type;
   ```
6. Esperar 24h y revisar que las 4 tablas reciben datos.

## Criterio de done

- ≥ 3 entities con `metadata->>'es_competidor' = 'true'` por org.
- Después de 24-48h:
  ```sql
  SELECT count(*) FROM competitor_ads;     -- > 0
  SELECT count(*) FROM retail_prices;      -- > 0 (si hay marketplace entities)
  SELECT count(*) FROM url_watchers;       -- > 0 (si hay web entities)
  ```
- Dashboard "Mi Competencia" muestra datos reales de SKU vs SKU, ads del rival, etc.
