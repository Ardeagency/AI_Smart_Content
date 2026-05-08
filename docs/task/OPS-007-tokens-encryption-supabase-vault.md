---
id: OPS-007
title: Migración global cifrado de tokens vía Supabase Vault
severity: medium
type: ops
status: open
auto_eligible: no
auto_eligible_reason: requiere decisión arquitectónica + rotación coordinada de secrets
est_duration: long
created: 2026-05-07
owner: -
related: [SHOPIFY-INTEGRATION (D2), OPS-005-secrets-backup-strategy]
---

# OPS-007 · Cifrado global de tokens de integración

## Síntoma / riesgo

Hoy `brand_integrations.access_token` y `brand_integrations.refresh_token` se almacenan **en plain text**. La columna `encryption_iv` está reservada en el schema pero **no se usa**: `src/lib/integration-token.js` en el ai-engine lee `access_token` directamente sin decrypt.

```js
// integration-token.js:69 — estado actual
.select("id, platform, access_token, refresh_token, token_expires_at, metadata, is_active")
// ^^ devuelve plain text al consumer
```

**Riesgo:** cualquier dump de la BD (backup, export, query con service_role) expone tokens OAuth de Meta, Google, y próximamente Shopify, en claro. Si la BD se compromete, los tokens permiten acceso indefinido a las integraciones del cliente sin alerta.

**Confirmado en sprint Shopify (2026-05-07, decisión D2):** la integración Shopify NO inventa cifrado propio (rompería consistencia). Se documenta la deuda aquí y se resuelve global cuando se ataque.

## Tablas afectadas

```
brand_integrations.access_token       text  ← cifrar
brand_integrations.refresh_token      text  ← cifrar
brand_integrations.encryption_iv      text  ← usar (hoy NULL)
```

Cantidad de filas hoy: 2 (1 google + 1 facebook). Bajo volumen — migración indolora.

## Opciones técnicas

### Opción A — Supabase Vault (recomendada)

`supabase_vault 0.3.1` ya está instalado en la BD (verificado).

```sql
-- Crear secret por integration
SELECT vault.create_secret(<token>, 'brand_integration_<id>_access');

-- Lectura via service_role
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'brand_integration_<id>_access';
```

**Pros:**
- Sin nueva dependencia
- Cifrado at-rest gestionado por Supabase
- Auditable
- Rotación centralizada

**Contras:**
- Tokens fuera de la tabla principal (lookup en 2 pasos)
- Requiere reescribir `integration-token.js` para leer del vault

### Opción B — pgsodium en columna

```sql
SELECT pgsodium.crypto_aead_det_encrypt(
  convert_to(<token>, 'utf8'),
  convert_to(<integration_id>, 'utf8'),
  <key_id>::uuid,
  decode(<encryption_iv>, 'hex')
)
```

**Pros:**
- Tokens permanecen en `brand_integrations`
- Encryption_iv ya está en schema

**Contras:**
- Supabase deprecó parcialmente pgsodium en 2024 (hosted projects). Verificar si aún disponible en proyecto actual.
- Manejo de keys más complejo

### Opción C — Cifrado en aplicación (Node `crypto` AES-256-GCM)

```js
const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
const encrypted = cipher.update(token, 'utf8', 'base64') + cipher.final('base64');
```

Key en `.env` del ai-engine. `encryption_iv` se llena con el IV. Incluir auth tag en metadata.

**Pros:**
- Sin dependencia de extensiones BD
- Funciona en cualquier deploy

**Contras:**
- Key en `.env` (depende de OPS-005 secrets backup)
- Si la VM muere y no hay backup de la key → tokens irrecuperables

## Recomendación

**Opción A (Supabase Vault)** alineado con OPS-005 (secrets backup). Ambos dependen del mismo manager.

## Pasos de implementación (cuando se tome la tarea)

1. Verificar que `vault.create_secret` funciona en el proyecto.
2. Crear migración:
   - Por cada `brand_integrations` activa, crear `vault.secret` con el token.
   - UPDATE `brand_integrations.access_token = '<vault_secret_id>'` (UUID, no token).
   - Hacer lo mismo con `refresh_token`.
3. Reescribir `integration-token.js` para hacer JOIN con `vault.decrypted_secrets`:
   ```js
   .select("id, platform, access_token, ...")  // access_token = secret_id
   // luego lookup en vault para obtener el token real
   ```
4. Actualizar todas las funciones Netlify que leen tokens (`api-integrations-exchange.js`, `api-insights-fetch.js`, etc.).
5. Sweep de logs: confirmar que no hay tokens loggeados accidentalmente.
6. Rotar todos los tokens existentes (forzar re-OAuth) como medida de seguridad — los plain text actuales pudieron quedar en backups.
7. Documentar el patrón en `docs/platform/03-database.md`.

## Criterio de done

- 0 tokens en plain text en `brand_integrations`.
- `encryption_iv` populado para todas las filas activas (o el secret_id en vault).
- `integration-token.js` lee via vault con tests verdes.
- Funciones Netlify actualizadas sin regresión funcional.
- Tokens existentes rotados.
- Documentación actualizada.

## Tareas relacionadas

- **OPS-005** — Backup secrets strategy: la key de cifrado (si Opción C) o el master de Vault deben estar en el plan de backup.
- **SHOPIFY-INTEGRATION** (D2): Shopify se incorpora sin cifrado individual; cuando se cierre OPS-007, los tokens Shopify entran al mismo flujo.
