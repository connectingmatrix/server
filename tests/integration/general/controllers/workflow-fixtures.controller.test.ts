import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowFixturesController } from '../../src/controllers/runtime/workflow-fixtures.controller';

function mockResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 0,
    body: '',
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(value: number) {
      this.statusCode = value;
      return this;
    },
    send(value: string) {
      this.body = value;
      return this;
    },
  };
}

test('downloadLatestAiAgentWorkflow returns downloadable workflow json', () => {
  const controller = new WorkflowFixturesController();
  const response = mockResponse();
  controller.downloadLatestAiAgentWorkflow(response as any);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['content-disposition'], 'attachment; filename="chat-parity-ai-agent-workflow.latest.json"');
  const payload = JSON.parse(response.body || '{}');
  assert.equal(Array.isArray(payload.nodes), true);
  assert.equal(Array.isArray(payload.connections), true);
  assert.equal(
    payload.nodes.some((node: any) => node?.modelId === 'ai-agent'),
    true,
  );
});
