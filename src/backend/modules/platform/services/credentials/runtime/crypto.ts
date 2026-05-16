import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { EnvLoader } from '@giga/shared/lib/env';
import type { CredentialFieldValues } from '../contracts/types';

const ENCRYPTION_PREFIX = 'v1';

function resolveKey(): Buffer {
  const raw = String(EnvLoader.getOrThrow('CREDENTIAL_ENCRYPTION_KEY')).trim();

  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  try {
    const asBase64 = Buffer.from(raw, 'base64');
    if (asBase64.length === 32) {
      return asBase64;
    }
  } catch {
    // noop
  }

  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === 32) {
    return utf8;
  }

  return createHash('sha256').update(raw).digest();
}

export function encryptCredentialJson(value: CredentialFieldValues): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', resolveKey(), iv);
  const plainText = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [ENCRYPTION_PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptCredentialJson(value: string): CredentialFieldValues {
  const [prefix, ivRaw, tagRaw, cipherRaw] = String(value || '').split(':');
  if (prefix !== ENCRYPTION_PREFIX || !ivRaw || !tagRaw || !cipherRaw) {
    throw new Error('Invalid credential secret payload.');
  }

  const decipher = createDecipheriv('aes-256-gcm', resolveKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherRaw, 'base64url')), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(decrypted);

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Credential secret payload must decode to an object.');
  }

  return parsed as CredentialFieldValues;
}
