import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeMonitorResolvers } from '@connectingmatrix/orm/services/graphql/entity/integration/runtime-monitor-resolvers';

test('runtime monitor resolver exposes runtime monitor and ingestion controls', async () => {
  assert.equal(typeof runtimeMonitorResolvers.Query.runtimeMonitor, 'function');
  assert.equal(typeof runtimeMonitorResolvers.Query.ingestionJob, 'function');
  assert.equal(typeof runtimeMonitorResolvers.Mutation.runtimeMonitorStopProcess, 'function');
  assert.equal(typeof runtimeMonitorResolvers.Mutation.runtimeMonitorKillProcess, 'function');
});
