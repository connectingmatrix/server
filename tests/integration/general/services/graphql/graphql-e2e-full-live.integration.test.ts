import assert from 'node:assert/strict';
import { after, before, test, type TestContext } from 'node:test';
import { bootLiveSweep, type SweepFixture } from './live-query-sweep.fixture';
import { grantTemporaryOrgMember, readRoles, restoreTemporaryOrgMember, type RoleSession } from './graphql-e2e-full.fixture';
import { grantTemporaryOrgMemberTreePermissions, restoreTemporaryPermissions } from './graphql-e2e-full.permissions';
import { assertExternalReadiness } from './graphql-e2e-full.readiness';
import { readSchemaIndex, runMutationInventory, runQuerySweep } from './graphql-e2e-full.coverage';
import { runTreeIntegrity } from './graphql-e2e-full.tree';
import { runOrgMemberTreeMatrix } from './graphql-e2e-full.org-member';
import type { SchemaIndex } from './live-query-sweep.graphql';

const port = 3401 + Math.floor(Math.random() * 400);
let cleanup: (() => Promise<void>) | null = null;
let fixture: SweepFixture;
let index: SchemaIndex;
let roles: Record<'root' | 'orgAdmin' | 'normal', RoleSession>;
let token = '';
let url = '';
let orgId = '';
let ready = false;
let readinessError: unknown = null;
let memberSnapshot: Awaited<ReturnType<typeof grantTemporaryOrgMember>> | null = null;
let permissionSnapshots: Awaited<ReturnType<typeof grantTemporaryOrgMemberTreePermissions>> = [];

before(async () => {
  try {
    process.env.USER_MATRIX_CACHE_TTL_MS = '0';
    process.env.USER_ACCESS_CACHE_TTL_MS = '0';
    roles = await readRoles();
    orgId = roles.orgAdmin.organizationIds[0] || '';
    assert.equal(Boolean(orgId), true, 'Org super-admin test user must belong to an organization.');
    await assertExternalReadiness();
    memberSnapshot = await grantTemporaryOrgMember(orgId, roles.normal.userId);
    permissionSnapshots = await grantTemporaryOrgMemberTreePermissions(orgId, roles.normal.userId);
    const runtime = await bootLiveSweep(port);
    cleanup = runtime.cleanup;
    fixture = runtime.fixture;
    token = runtime.token;
    url = runtime.url;
    index = await readSchemaIndex(url, token);
    ready = true;
  } catch (error) {
    readinessError = error;
  }
});

after(async () => {
  if (cleanup) await cleanup();
  await restoreTemporaryPermissions(permissionSnapshots);
  await restoreTemporaryOrgMember(memberSnapshot);
});

function skipWhenNotReady(context: TestContext): boolean {
  if (!readinessError) return false;
  context.skip(`readiness failed: ${readinessError instanceof Error ? readinessError.message : String(readinessError)}`);
  return true;
}

test('full live graphql external services are ready', () => {
  if (readinessError) throw readinessError;
  assert.equal(ready, true, 'Full GraphQL E2E setup must complete before endpoint coverage runs.');
});

test('full live graphql query inventory executes every query', async (context) => {
  if (skipWhenNotReady(context)) return;
  await runQuerySweep({ fixture, index, token, url });
});

test('full live graphql mutation inventory is classified and permission asserted', async (context) => {
  if (skipWhenNotReady(context)) return;
  await runMutationInventory({ fixture, index, url });
});

test('tree integrity rejects parentless and inaccessible writes', async (context) => {
  if (skipWhenNotReady(context)) return;
  await runTreeIntegrity({
    fixture,
    normalToken: roles.normal.token,
    orgAdminToken: roles.orgAdmin.token,
    rootToken: roles.root.token,
    url,
  });
});

test('temporary org member can create/update-owned tree data but cannot delete it', async (context) => {
  if (skipWhenNotReady(context)) return;
  await runOrgMemberTreeMatrix({
    memberToken: roles.normal.token,
    organizationId: orgId,
    rootToken: roles.root.token,
    url,
  });
});
