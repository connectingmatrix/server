import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { graphqlRequest } from './activity-log-live.runtime.fixture';
import { bootLiveSweep, type SweepFixture } from './live-query-sweep.fixture';
import { INTROSPECTION_QUERY, buildQueryDocument, fieldSelection, parseSchemaIndex, type SchemaField } from './live-query-sweep.graphql';
import { valuesForArgs } from './live-query-sweep.values';

const port = 3021;
let fixture: SweepFixture;
let token = '';
let url = '';
let cleanup: (() => Promise<void>) | null = null;

before(async () => {
  const runtime = await bootLiveSweep(port);
  fixture = runtime.fixture;
  token = runtime.token;
  url = runtime.url;
  cleanup = runtime.cleanup;
});

after(async () => {
  if (cleanup) await cleanup();
});

test('live graphql priority queries aiFetchUserTree and billingAccessState return data', async () => {
  const tree = await graphqlRequest<{ aiFetchUserTree: { global: unknown[]; organization: unknown[]; user: unknown[] } }>(
    url,
    token,
    'query Tree($input: AI_FetchUserTreeInput!) { aiFetchUserTree(input: $input) { user { id } organization { id } global { id } } }',
    { input: { userPermissionsId: fixture.userId, includeGlobal: true } },
  );
  const billing = await graphqlRequest<{ billingAccessState: { billingStatus: string; canAccessApp: boolean; subjectType: string } }>(
    url,
    token,
    'query Billing { billingAccessState { billingStatus canAccessApp subjectType } }',
    {},
  );
  assert.equal(Array.isArray(tree.aiFetchUserTree.user), true);
  assert.equal(text(billing.billingAccessState.billingStatus).length > 0, true);
});

test('live graphql mutation ensureGettingStartedOnboarding returns ids', async () => {
  const data = await graphqlRequest<{
    ensureGettingStartedOnboarding: {
      channelId: string | null;
      categoryId: string | null;
      subjectId: string | null;
      postId: string | null;
      chatId: string | null;
      route: string | null;
    };
  }>(
    url,
    token,
    `mutation EnsureGettingStartedOnboarding($input: EnsureGettingStartedOnboardingInput) {
      ensureGettingStartedOnboarding(input: $input) {
        channelId
        categoryId
        subjectId
        postId
        chatId
        route
      }
    }`,
    { input: {} },
  );
  assert.equal(text(data.ensureGettingStartedOnboarding.channelId).length > 0, true);
  assert.equal(text(data.ensureGettingStartedOnboarding.categoryId).length > 0, true);
  assert.equal(text(data.ensureGettingStartedOnboarding.subjectId).length > 0, true);
  assert.equal(text(data.ensureGettingStartedOnboarding.postId).length > 0, true);
});

test('live graphql query sweep executes explicit and generated query fields', async () => {
  const schema = await graphqlRequest<{ __schema: { queryType?: { name?: string | null } | null; types?: unknown[] | null } }>(
    url,
    token,
    INTROSPECTION_QUERY,
    {},
  );
  const index = parseSchemaIndex(schema.__schema as never);
  const unresolved: Array<{ field: string; paths: string[] }> = [];
  const failed: Array<{ field: string; message: string }> = [];
  let executed = 0;
  for (const field of index.queryFields) {
    const args = valuesForArgs(field.args, index, fixture);
    if (args.unresolved.length) {
      unresolved.push({ field: field.name, paths: args.unresolved });
      continue;
    }
    const query = buildQueryDocument(field as SchemaField, fieldSelection(field as SchemaField, index), args.values);
    try {
      await graphqlRequest(url, token, query, args.values, { timeoutMs: 20_000 });
      executed += 1;
    } catch (error) {
      failed.push({ field: field.name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  process.stdout.write(
    `query-sweep totals => discovered:${index.queryFields.length} executed:${executed} unresolved:${unresolved.length} failed:${failed.length}\n`,
  );
  assert.equal(unresolved.length, 0, `unresolved-required-arg fields: ${JSON.stringify(unresolved, null, 2)}`);
  assert.equal(failed.length, 0, `query execution failures: ${JSON.stringify(failed.slice(0, 25), null, 2)}`);
});

function text(value: unknown): string {
  return String(value || '').trim();
}
