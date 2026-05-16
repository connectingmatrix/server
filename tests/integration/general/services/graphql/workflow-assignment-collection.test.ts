import assert from 'node:assert/strict';
import test from 'node:test';
import { applyWorkflowAssignmentCollectionFilter } from '@giga/general/services/graphql/resolvers/integration/workflow.resolver';

function createQuery(rows: Array<Record<string, any>>) {
  const filters: Array<(row: Record<string, any>) => boolean> = [];
  return {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return this;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return this;
    },
    is(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return this;
    },
    not(column: string, operator: string, value: unknown) {
      filters.push((row) => !(operator === 'is' && row[column] === value));
      return this;
    },
    then(resolve: (value: { data: Array<Record<string, any>>; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      const data = rows.filter((row) => filters.every((filter) => filter(row)));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
}

test('applyWorkflowAssignmentCollectionFilter keeps only matching scoped chat attachments', async () => {
  const query = createQuery([
    { id: 'assign-1', workflow_id: 'workflow-1', scope_type: 'CHANNEL', scope_id: 'channel-1' },
    { id: 'assign-2', workflow_id: 'workflow-2', scope_type: 'CHANNEL', scope_id: 'channel-2' },
    { id: 'assign-3', workflow_id: 'workflow-1', scope_type: 'SUBJECT', scope_id: null },
    { id: 'assign-4', workflow_id: 'workflow-1', scope_type: 'POST', scope_id: 'post-1' },
  ]);

  const result = await applyWorkflowAssignmentCollectionFilter(query, {
    workflow_id: { in: ['workflow-1'] },
    scope_type: { in: ['channel', 'post'] },
    scope_id: { is: 'NOT_NULL' },
  });

  assert.deepEqual(
    result.data.map((row) => row.id),
    ['assign-1', 'assign-4'],
  );
});
