---
id: OPS-005
title: Backup del .env del ai-engine en secret manager
severity: low
type: ops
status: open
created: 2026-04-29
owner: -
---

# OPS-005 · Estrategia de backup de secrets

## Síntoma / riesgo

`/root/ai-engine/.env` contiene 27+ secrets críticos (Anthropic, OpenAI, Hetzner, Supabase service key, JWT secrets, OAuth, internal tokens). Hoy es **el único lugar donde existen** algunos de esos valores.

Si la VM Hetzner muere o se corrompe el FS:
- Algunos secrets son recuperables (re-generar API keys).
- Otros requieren reconfigurar OAuth flows con cliente.
- `INTERNAL_*_TOKEN` y `OPENCLAW_GATEWAY_TOKEN` se pueden regenerar pero hay coordinación con frontend.

## Acción

Elegir estrategia (cualquiera funciona):

### Opción A — 1Password / Bitwarden Secrets Manager
- Crear vault "AI Smart Content prod".
- Agregar cada variable como secret individual.
- Documentar acceso en runbook.

### Opción B — Supabase Vault
Ya está instalada (`supabase_vault 0.3.1`). Permite guardar secrets cifrados en la BD.

```sql
SELECT vault.create_secret('ANTHROPIC_API_KEY', 'sk-ant-...');
-- Lectura:
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ANTHROPIC_API_KEY';
```

Beneficio: 1 fuente de verdad. El ai-engine puede leer al arrancar (en lugar de desde `.env`).

### Opción C — Encrypted file en repo privado
- Crear `secrets/.env.gpg` cifrado con clave compartida.
- Documentar cómo descifrar al provisionar VM nueva.

## Recomendación

**Opción B (Supabase Vault)** porque:
- Ya está instalada, sin costos extra.
- Centralizada con la BD que es el source of truth.
- Permite rotación con auditoría.
- Frontend Functions pueden leer si necesitan algún secret server-side.

## Pasos

1. Decidir estrategia con el equipo.
2. Migrar secrets uno por uno.
3. Refactor `ai-engine/src/lib/supabase.js` para leer de Vault si elegimos B.
4. Documentar en `docs/platform/08-deployment.md`.

## Criterio de done

- Todos los secrets críticos respaldados fuera del FS de la VM.
- Runbook actualizado: "VM destruida → bootstrap nueva en X pasos" puede ejecutarse sin intervención del que originó los secrets.
