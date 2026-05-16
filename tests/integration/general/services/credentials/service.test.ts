import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestError } from 'routing-controllers';
import { validateCredentialValues } from '@giga/general/services/credentials';

test('validateCredentialValues accepts supported optional fields', () => {
  const values = validateCredentialValues('openai', {
    api_key: 'secret',
    organization_id: 'org_123',
  });

  assert.equal(values.api_key, 'secret');
  assert.equal(values.organization_id, 'org_123');
});

test('validateCredentialValues rejects unsupported fields', () => {
  assert.throws(
    () =>
      validateCredentialValues('openai', {
        api_key: 'secret',
        bad_field: 'nope',
      } as any),
    BadRequestError,
  );
});

test('validateCredentialValues rejects missing required fields', () => {
  assert.throws(
    () =>
      validateCredentialValues('openai', {
        organization_id: 'org_123',
      } as any),
    BadRequestError,
  );
});

test('validateCredentialValues accepts a single-server MCP credential payload', () => {
  const values = validateCredentialValues('mcp', {
    mcpServers: {
      demo: {
        type: 'streamable-http',
        url: 'https://demo.example.com/mcp',
        headers: {
          Authorization: 'Bearer token',
        },
        note: 'demo',
      },
    },
  });

  assert.equal((values.mcpServers as any).demo.url, 'https://demo.example.com/mcp');
});

test('validateCredentialValues rejects MCP credentials with multiple servers', () => {
  assert.throws(
    () =>
      validateCredentialValues('mcp', {
        mcpServers: {
          first: {
            type: 'streamable-http',
            url: 'https://first.example.com/mcp',
          },
          second: {
            type: 'streamable-http',
            url: 'https://second.example.com/mcp',
          },
        },
      } as any),
    BadRequestError,
  );
});

test('validateCredentialValues rejects MCP credentials with unsupported transport', () => {
  assert.throws(
    () =>
      validateCredentialValues('mcp', {
        mcpServers: {
          demo: {
            type: 'stdio',
            url: 'https://demo.example.com/mcp',
          },
        },
      } as any),
    BadRequestError,
  );
});
