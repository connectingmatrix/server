import assert from 'node:assert/strict';
import test from 'node:test';
import { OperationType, parseJSON } from '@connectingmatrix/graphql-parser';

test('parseJSON exposes the selected root field names for named operations', () => {
  const parsed = parseJSON({
    query: 'query UserActivityLogsCollection($first: Int) { user_activity_logsCollection(first: $first) { edges { node { id } } } }',
    variables: { first: 1 },
  });

  assert.equal(parsed?.operation.name, 'UserActivityLogsCollection');
  assert.deepEqual(parsed?.operation.fields, [
    { key: 'user_activity_logsCollection', name: 'user_activity_logsCollection', operation: OperationType.QUERY },
  ]);
});
