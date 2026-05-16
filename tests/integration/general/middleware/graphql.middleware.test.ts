import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphqlMiddleware } from '@giga/general/middleware/graphql.middleware';

test('beforeOperation reads public access from the root field name, not the GraphQL operation name', async () => {
  const middleware = new GraphqlMiddleware();
  const context = await middleware.beforeOperation(
    { headers: {} },
    {
      query: 'query AuthPingQuery { authPing }',
    },
  );

  assert.equal(context?.isPublicOperation, true);
  assert.equal(context?.operation.name, 'AuthPingQuery');
  assert.deepEqual(context?.operation.fields, [{ key: 'authPing', name: 'authPing', operation: 'query' }]);
});

test('beforeOperation accepts access-token-only requests when Supabase can resolve the user from the bearer', async () => {
  const middleware = new GraphqlMiddleware();
  const supabase = {
    __access_token: 'access-only-token',
    auth: {
      getUser: async (token?: string) => {
        if (token !== 'access-only-token') {
          return { data: { user: null }, error: new Error('Auth session missing!') };
        }
        return { data: { user: { id: 'user-1', app_metadata: { root: true } } }, error: null };
      },
    },
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

  const context = await middleware.beforeOperation(
    {
      headers: {
        authorization: 'Bearer access-only-token',
      },
      supabase,
    },
    {
      query: 'query SubjectCollection { subjectCollection(first: 1) { pageInfo { hasNextPage } } }',
    },
  );

  assert.equal(context?.isPublicOperation, false);
  assert.equal(context?.userId, 'user-1');
  assert.equal(context?.effectiveRoot, true);
});
