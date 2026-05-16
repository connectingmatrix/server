import test from 'node:test';
import assert from 'node:assert/strict';
import { Server } from './index.js';
function module(name, runtime) {
    return { name, version: 'test', health: () => ({ name, status: 'ok', checkedAt: new Date().toISOString() }), runtime };
}
test('server binds workflow executor pubsub into workflows and process monitor', () => {
    const calls = [];
    const processMonitoring = { bindWorkflowExecutorPubsub: () => calls.push('processMonitor.executor') };
    const Workflows = { bindExecutorPubSub: () => calls.push('workflows.executor') };
    Server.registerMany([
        module('@connectingmatrix/logger', { processMonitoring }),
        module('@connectingmatrix/workflows', { Workflows }),
    ]);
    Server.bindWorkflowExecutor({ queueWorkflowForExecution: () => ({ publish: async () => { } }) });
    assert.ok(calls.includes('processMonitor.executor'));
    assert.ok(calls.includes('workflows.executor'));
    assert.equal(Server.health().details.workflowExecutorBound, true);
});
