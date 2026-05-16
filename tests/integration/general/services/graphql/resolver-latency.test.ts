import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidateGraphqlCache, runNamedGraphqlCache } from '@giga/shared/cache';

const guardedResolvers = ['aiFetchUserTree', 'organizations', 'workflowCatalogRecords', 'billingAccessState'];

test('UI-critical cached GraphQL reads are not cut off by the old test timeout guard', async () => {
  const previous = process.env.GRAPHQL_CACHE_READ_TIMEOUT_MS;
  process.env.GRAPHQL_CACHE_READ_TIMEOUT_MS = '40';
  try {
    invalidateGraphqlCache(['']);
    for (const operationName of guardedResolvers) {
      const variables = { input: { organizationId: operationName } };
      const recovered = await runNamedGraphqlCache({
        operationName,
        read: async () => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return { operationName };
        },
        userId: 'user-1',
        variables,
      });
      assert.deepEqual(recovered, { operationName });
    }
  } finally {
    if (previous === undefined) delete process.env.GRAPHQL_CACHE_READ_TIMEOUT_MS;
    else process.env.GRAPHQL_CACHE_READ_TIMEOUT_MS = previous;
  }
});
