import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { decryptCredentialJson, encryptCredentialJson } = require('@giga/general/services/credentials/runtime/crypto');

test('credential crypto round-trips and does not store raw JSON', () => {
  const value = {
    api_key: 'secret',
    organization_id: 'org_123',
  };

  const encrypted = encryptCredentialJson(value);
  assert.notEqual(encrypted.includes('secret'), true);
  assert.deepEqual(decryptCredentialJson(encrypted), value);
});
