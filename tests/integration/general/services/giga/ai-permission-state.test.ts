import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPermissionSummary, memberGrantBlocked, permissionInputHasValues } from '@giga/general/services/giga/auth/ai-permission-state';

test('buildPermissionSummary treats missing and null values as allowed', () => {
  const summary = buildPermissionSummary(
    { id: 'org', scope: 'ORGANIZATION', module: 'WORKFLOW', can_create: null, can_read: false },
    { id: 'member', scope: 'ORGANIZATION_MEMBER', module: 'WORKFLOW', can_execute: null },
  );

  assert.equal(summary.allowCreate, true);
  assert.equal(summary.allowRead, false);
  assert.equal(summary.allowExecute, true);
});

test('memberGrantBlocked prevents member allow flags from bypassing org denies', () => {
  const blocked = memberGrantBlocked(
    { id: 'org', scope: 'ORGANIZATION', module: 'WORKFLOW', can_create: false, can_execute: false },
    { scope: 'ORGANIZATION_MEMBER', organizationId: 'org-1', userId: 'user-1', module: 'WORKFLOW', can_create: true, can_execute: true },
  );

  assert.equal(blocked, true);
});

test('permissionInputHasValues only keeps rows with explicit tri-state values', () => {
  assert.equal(
    permissionInputHasValues({
      scope: 'USER',
      userId: 'user-1',
      module: 'WORKFLOW',
      can_create: null,
      can_read: null,
      can_update: null,
      can_delete: null,
      can_execute: null,
    }),
    false,
  );
  assert.equal(
    permissionInputHasValues({
      scope: 'USER',
      userId: 'user-1',
      module: 'WORKFLOW',
      can_create: true,
    }),
    true,
  );
});
