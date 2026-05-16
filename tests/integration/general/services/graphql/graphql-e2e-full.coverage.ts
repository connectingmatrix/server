import assert from 'node:assert/strict';
import { graphqlRequest } from './activity-log-live.runtime.fixture';
import { EXPECTED_MUTATIONS, PUBLIC_MUTATIONS } from './graphql-e2e-full.registry';
import { mutationErrorText, mutationVariables } from './graphql-e2e-full.mutations';
import { requestGraphql } from './graphql-e2e-full.fixture';
import {
  buildMutationDocument,
  buildQueryDocument,
  fieldSelection,
  INTROSPECTION_QUERY,
  parseSchemaIndex,
  type SchemaField,
  type SchemaIndex,
} from './live-query-sweep.graphql';
import { valuesForArgs } from './live-query-sweep.values';
import type { SweepFixture } from './live-query-sweep.fixture';

type SchemaPayload = { __schema: { mutationType?: { name?: string | null } | null; queryType?: { name?: string | null } | null; types?: unknown[] } };

export async function readSchemaIndex(url: string, token: string) {
  const schema = await graphqlRequest<SchemaPayload>(url, token, INTROSPECTION_QUERY, {}, { timeoutMs: 120_000 });
  return parseSchemaIndex(schema.__schema as never);
}

export async function runQuerySweep(input: { fixture: SweepFixture; index: SchemaIndex; token: string; url: string }) {
  const unresolved: Array<{ field: string; paths: string[] }> = [];
  const failed: Array<{ field: string; message: string }> = [];
  let executed = 0;
  for (const field of input.index.queryFields) {
    const args = valuesForArgs(field.args, input.index, input.fixture);
    if (args.unresolved.length) {
      unresolved.push({ field: field.name, paths: args.unresolved });
      continue;
    }
    const query = buildQueryDocument(field as SchemaField, fieldSelection(field as SchemaField, input.index), args.values);
    try {
      await graphqlRequest(input.url, input.token, query, args.values, { timeoutMs: 20_000 });
      executed += 1;
    } catch (error) {
      failed.push({ field: field.name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  process.stdout.write(`full-query-sweep discovered:${input.index.queryFields.length} executed:${executed} failed:${failed.length}\n`);
  assert.equal(unresolved.length, 0, JSON.stringify(unresolved, null, 2));
  assert.equal(failed.length, 0, JSON.stringify(failed.slice(0, 30), null, 2));
}

export async function runMutationInventory(input: { fixture: SweepFixture; index: SchemaIndex; url: string }) {
  const discovered = new Set(input.index.mutationFields.map((field) => field.name));
  const missing = [...EXPECTED_MUTATIONS].filter((name) => !discovered.has(name));
  const unclassified = [...discovered].filter((name) => !EXPECTED_MUTATIONS.has(name));
  assert.deepEqual(missing, [], `missing expected mutations: ${missing.join(', ')}`);
  assert.deepEqual(unclassified, [], `unclassified mutations: ${unclassified.join(', ')}`);

  const failed: Array<{ field: string; message: string }> = [];
  for (const field of input.index.mutationFields) {
    const args = valuesForArgs(field.args, input.index, input.fixture);
    const variables = mutationVariables(field.name, args.values, input.fixture);
    const mutation = buildMutationDocument(field as SchemaField, fieldSelection(field as SchemaField, input.index), variables);
    const payload = await requestGraphql(input.url, null, mutation, variables);
    const message = mutationErrorText(payload);
    if (PUBLIC_MUTATIONS.has(field.name)) {
      if (!payload.data && !payload.errors?.length) failed.push({ field: field.name, message: 'No public mutation response.' });
      continue;
    }
    if (!/auth|access|permission|plan|required|invalid|not found|forbidden|unauthorized/i.test(message)) {
      failed.push({ field: field.name, message: message || JSON.stringify(payload) });
    }
  }
  process.stdout.write(`full-mutation-inventory discovered:${input.index.mutationFields.length} failed:${failed.length}\n`);
  assert.equal(failed.length, 0, JSON.stringify(failed.slice(0, 30), null, 2));
}
