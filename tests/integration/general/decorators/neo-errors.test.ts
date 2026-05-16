import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldResetNeo4jConnection } from '../../src/decorators/runtime/neo-errors';

test('neo4j connection reset detection is based on driver failures', () => {
  assert.equal(shouldResetNeo4jConnection(new Error('connection acquisition failed')), true);
  assert.equal(shouldResetNeo4jConnection(new Error('validation failed')), false);
});
