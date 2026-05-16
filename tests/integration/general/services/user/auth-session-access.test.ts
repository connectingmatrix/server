import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestError } from 'routing-controllers';
import {
  assertAuthSessionAccess,
  evaluateAuthSessionAccess,
  INACTIVE_ORGANIZATION_AUTH_ERROR_MESSAGE,
} from '@giga/permissions/services/auth/session-access';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';

test('evaluateAuthSessionAccess allows users with no organization memberships', async () => {
  const supabase = createSupabaseStub({
    organization_members: [],
    organizations: [],
  });

  const result = await evaluateAuthSessionAccess(supabase as any, 'user-1');

  assert.equal(result.allowed, true);
  assert.equal(result.hasMemberships, false);
});

test('evaluateAuthSessionAccess allows users with at least one active organization membership', async () => {
  const supabase = createSupabaseStub({
    organization_members: [
      { id: 'm-active', organization_id: 'org-active', user_id: 'user-1', role: 'MEMBER', is_disabled: false, metadata: {} },
      { id: 'm-inactive', organization_id: 'org-inactive', user_id: 'user-1', role: 'MEMBER', is_disabled: false, metadata: {} },
    ],
    organizations: [
      { id: 'org-active', is_active: true },
      { id: 'org-inactive', is_active: false },
    ],
  });

  const result = await evaluateAuthSessionAccess(supabase as any, 'user-1');

  assert.equal(result.allowed, true);
  assert.deepEqual(result.activeOrganizationIds, ['org-active']);
});

test('assertAuthSessionAccess rejects non-root users whose memberships are all inactive', async () => {
  const supabase = createSupabaseStub({
    organization_members: [
      { id: 'm-inactive', organization_id: 'org-inactive', user_id: 'user-1', role: 'MEMBER', is_disabled: false, metadata: {} },
    ],
    organizations: [{ id: 'org-inactive', is_active: false }],
  });

  await assert.rejects(
    () => assertAuthSessionAccess(supabase as any, 'user-1'),
    (error: unknown) => {
      assert.equal(error instanceof BadRequestError, true);
      assert.equal((error as Error).message, INACTIVE_ORGANIZATION_AUTH_ERROR_MESSAGE);
      return true;
    },
  );
});

test('assertAuthSessionAccess allows root users even when all memberships are inactive', async () => {
  const supabase = createSupabaseStub({
    organization_members: [
      { id: 'm-inactive', organization_id: 'org-inactive', user_id: 'user-1', role: 'MEMBER', is_disabled: false, metadata: {} },
    ],
    organizations: [{ id: 'org-inactive', is_active: false }],
  });

  await assert.doesNotReject(() => assertAuthSessionAccess(supabase as any, 'user-1', true));
});
