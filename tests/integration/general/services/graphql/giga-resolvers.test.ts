import '@giga/shared/test/dom-polyfills';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppRootUserEntity } from '@connectingmatrix/orm/repositories/entities';
import { OrgResolver } from '@giga/general/services/graphql/resolvers/integration/org.resolver';
import * as resolversModule from '@giga/general/services/graphql/resolvers';

test('resolver index no longer exports GIGA_RESOLVER_DEPS', () => {
  assert.equal('GIGA_RESOLVER_DEPS' in (resolversModule as Record<string, unknown>), false);
});

test('rootIdentity exposes user-based contract only', async (t) => {
  const query = {
    where: () => query,
    select: () => query,
    many: async () => [],
  };
  t.mock.method(AppRootUserEntity, 'find', () => query as never);

  const resolver = new OrgResolver();
  const result = await resolver.rootIdentity({}, {
    request: { headers: {} },
    supabase: {} as any,
    body: {},
    userId: 'user-1',
    effectiveRoot: true,
  } as any);

  assert.deepEqual(Object.keys(result).sort(), ['activeRootCount', 'isRootUser', 'rootUser']);
  assert.equal(typeof result.activeRootCount, 'number');
  assert.equal(result.isRootUser, true);
  if (result.rootUser) {
    assert.equal(typeof result.rootUser, 'object');
  }
});

test('users resolver rejects non-root access', async () => {
  const resolver = new OrgResolver();
  const supabase = {
    __auth_user_id: 'user-1',
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  };

  await assert.rejects(
    () =>
      resolver.users({}, {
        request: { headers: {} },
        supabase,
        body: {},
        userId: 'user-1',
        effectiveRoot: false,
      } as any),
    /Only root users can list users/i,
  );
});
