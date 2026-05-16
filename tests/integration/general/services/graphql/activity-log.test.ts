import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUserActivityLogs } from '@giga/general/services/graphql/activity-log';

const context = {
  operation: {
    name: 'ActivityTest',
    type: 'mutation',
    variable: {},
    fields: [],
  },
  isPublicOperation: false,
  hasUserToken: true,
  accessToken: 'dashed:user-1',
  userId: 'user-1',
  effectiveRoot: true,
} as any;

test('buildUserActivityLogs resolves create rows from local mutation payloads', () => {
  const logs = buildUserActivityLogs({
    body: {
      operationName: 'CreateOrganization',
      query: 'mutation CreateOrganization($input: OrganizationInput!) { createOrganization(input: $input) { id slug } }',
      variables: {
        input: {
          slug: 'org-1',
        },
      },
    },
    context: {
      ...context,
      operation: {
        ...context.operation,
        fields: [{ key: 'createOrganization', name: 'createOrganization', operation: 'mutation' }],
      },
    },
    payload: {
      data: {
        createOrganization: {
          id: 'org-1',
          slug: 'org-1',
        },
      },
    },
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, 'CREATE');
  assert.equal(logs[0].organization_id, null);
  assert.equal(logs[0].subject, 'organization:org-1');
  assert.equal(logs[0].actor, 'createOrganization');
  assert.equal((logs[0].metadata as any).organizationId, 'org-1');
});

test('buildUserActivityLogs resolves update rows from proxied collection mutations', () => {
  const logs = buildUserActivityLogs({
    body: {
      operationName: 'UpdateWorkflow',
      query:
        'mutation UpdateWorkflow($filter: ai_workflowsFilter, $set: ai_workflowsUpdateInput!) { updateai_workflowsCollection(filter: $filter, set: $set) { affectedCount } }',
      variables: {
        filter: {
          id: { eq: 'wf-1' },
        },
      },
    },
    context: {
      ...context,
      operation: {
        ...context.operation,
        name: 'DifferentOperationName',
        fields: [{ key: 'updateai_workflowsCollection', name: 'updateai_workflowsCollection', operation: 'mutation' }],
      },
    },
    payload: {
      data: {
        updateai_workflowsCollection: {
          affectedCount: 1,
        },
      },
    },
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, 'UPDATE');
  assert.equal(logs[0].organization_id, null);
  assert.equal(logs[0].subject, 'ai_workflows:wf-1');
  assert.equal(logs[0].actor, 'updateai_workflowsCollection');
});

test('buildUserActivityLogs skips chat, workflow execution, and log-table mutations', () => {
  const body = (field: string) => ({
    operationName: field,
    query: `mutation ${field} { ${field} { __typename } }`,
    variables: {},
  });
  const operation = (field: string) => ({
    ...context,
    operation: {
      ...context.operation,
      fields: [{ key: field, name: field, operation: 'mutation' }],
    },
  });

  assert.equal(buildUserActivityLogs({ body: body('chatQuery'), context: operation('chatQuery'), payload: { data: { chatQuery: {} } } }).length, 0);
  assert.equal(
    buildUserActivityLogs({ body: body('workflowExecute'), context: operation('workflowExecute'), payload: { data: { workflowExecute: {} } } })
      .length,
    0,
  );
  assert.equal(
    buildUserActivityLogs({
      body: body('insertIntouser_activity_logsCollection'),
      context: operation('insertIntouser_activity_logsCollection'),
      payload: { data: { insertIntouser_activity_logsCollection: {} } },
    }).length,
    0,
  );
});
