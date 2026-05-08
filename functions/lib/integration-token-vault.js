/**
 * integration-token-vault.js (CommonJS — Netlify functions)
 *
 * AES-256-GCM envelope encryption para tokens OAuth almacenados en
 * `brand_integrations.access_token` y `.refresh_token`.
 *
 * Formato del valor encriptado:  enc_v1:{iv_b64}:{ciphertext+tag_b64}
 *
 * - `iv` es 12 bytes random (estándar GCM).
 * - `ciphertext+tag` es ciphertext concatenado con el auth tag de 16 bytes.
 * - El prefijo `enc_v1:` permite distinguir encrypted vs legacy plaintext.
 *   Si decryptToken() recibe un string sin el prefijo, lo devuelve as-is
 *   (compat con tokens viejos pre-migración — la migración los re-encripta).
 *
 * Master key: variable de entorno INTEGRATION_TOKEN_KEY (32 bytes en base64).
 * El mismo valor debe estar configurado en Netlify y en ai-engine .env.
 *
 * Rotación de clave (futuro): cambiar prefijo a enc_v2:, mantener decrypt
 * v1 + v2 simultáneamente, y migrar batch.
 */
const crypto = require('crypto');

const ALGO    = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ENV = 'INTEGRATION_TOKEN_KEY';
const PREFIX  = 'enc_v1:';

let _cachedKey = null;
function getKey() {
  if (_cachedKey) return _cachedKey;
  const b64 = process.env[KEY_ENV];
  if (!b64) throw new Error(`${KEY_ENV} env var missing`);
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes (got ${key.length})`);
  }
  _cachedKey = key;
  return key;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encripta `plaintext` (string). Idempotente: si ya viene encriptado, devuelve as-is.
 * Devuelve null/undefined sin tocar.
 */
function encryptToken(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString('base64') + ':' + Buffer.concat([ct, tag]).toString('base64');
}

/**
 * Decripta `stored`. Si no tiene prefijo enc_v1:, devuelve as-is (legacy plaintext).
 * Lanza error si está corrupto o el tag no cuadra.
 */
function decryptToken(stored) {
  if (stored == null) return stored;
  if (!isEncrypted(stored)) return stored;
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted token format');
  const iv = Buffer.from(parts[0], 'base64');
  const blob = Buffer.from(parts[1], 'base64');
  if (blob.length < TAG_BYTES + 1) throw new Error('Encrypted blob too short');
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ct  = blob.subarray(0, blob.length - TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Mutator: decripta access_token + refresh_token de una row de brand_integrations
 * (si vienen encriptados). Idempotente. Devuelve la misma referencia.
 */
function decryptIntegrationRow(row) {
  if (!row || typeof row !== 'object') return row;
  if (row.access_token != null)  row.access_token  = decryptToken(row.access_token);
  if (row.refresh_token != null) row.refresh_token = decryptToken(row.refresh_token);
  return row;
}

/**
 * Mutator: encripta access_token + refresh_token de un payload antes de escribir.
 */
function encryptIntegrationPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.access_token  != null) payload.access_token  = encryptToken(payload.access_token);
  if (payload.refresh_token != null) payload.refresh_token = encryptToken(payload.refresh_token);
  return payload;
}

module.exports = {
  encryptToken,
  decryptToken,
  isEncrypted,
  decryptIntegrationRow,
  encryptIntegrationPayload,
};
