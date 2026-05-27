// Encrypt / decrypt cloud credentials at rest using AES-256-GCM.
//
// Master key vem de process.env.CLOUD_CREDS_KEY (32 bytes hex = 64 chars).
// Se não definida, recusa criar/ler credenciais (fail-closed).
//
// Formato armazenado em DB (string única):
//   base64(iv || authTag || ciphertext)
//
// IV é 12 bytes random per-record (recomendado GCM).
// AuthTag é 16 bytes (default GCM).

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;   // 256 bits
const IV_LEN = 12;    // 96 bits (GCM standard)
const TAG_LEN = 16;   // 128 bits

function getKey() {
  const hex = process.env.CLOUD_CREDS_KEY;
  if (!hex) {
    throw new Error('CLOUD_CREDS_KEY env var not set — cannot encrypt/decrypt cloud credentials');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LEN) {
    throw new Error(`CLOUD_CREDS_KEY must be ${KEY_LEN * 2} hex chars (got ${hex.length})`);
  }
  return key;
}

/**
 * Encrypt plaintext credentials JSON string.
 * @param {string} plaintext
 * @returns {string} base64-encoded ciphertext
 */
export function encryptCredentials(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext.length) {
    throw new Error('encryptCredentials: plaintext must be non-empty string');
  }
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt ciphertext back to plaintext.
 * @param {string} ciphertextB64
 * @returns {string} plaintext credentials JSON
 */
export function decryptCredentials(ciphertextB64) {
  if (typeof ciphertextB64 !== 'string' || !ciphertextB64.length) {
    throw new Error('decryptCredentials: ciphertext must be non-empty string');
  }
  const key = getKey();
  const buf = Buffer.from(ciphertextB64, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('decryptCredentials: ciphertext too short');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Generate a fresh key for setup / docs. Operator runs this once to seed
 * CLOUD_CREDS_KEY in .env. NOT auto-generated at boot — explicit setup.
 *
 * Usage:
 *   node -e "import('./src/integrations/cloud/crypto.js').then(m => console.log(m.generateKey()))"
 */
export function generateKey() {
  return randomBytes(KEY_LEN).toString('hex');
}
