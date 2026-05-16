import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCredentialCatalogField } from '@giga/general/services/credentials/telemetry/catalog-field';

test('parseCredentialCatalogField maps secret and optional fields correctly', () => {
  const field = parseCredentialCatalogField('api_key', 'secret_string_optional');
  assert.equal(field.key, 'api_key');
  assert.equal(field.inputKind, 'secret');
  assert.equal(field.required, false);
  assert.equal(field.multiline, false);
});

test('parseCredentialCatalogField maps enum fields into options', () => {
  const field = parseCredentialCatalogField('mode', 'enum[sandbox,live]');
  assert.equal(field.inputKind, 'select');
  assert.deepEqual(
    field.options.map((option) => option.value),
    ['sandbox', 'live'],
  );
  assert.equal(field.required, true);
});
