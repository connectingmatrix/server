import test from 'node:test';
import assert from 'node:assert/strict';
import { Server } from './index.js';
test('registers module', async () => {
    Server.register({ name: 'x', version: '1', health: () => ({ name: 'x', status: 'ok', checkedAt: new Date().toISOString() }) });
    assert.equal((await Server.health()).status, 'ok');
});
test('merged graphql returns a resolver map instead of resolver arrays', () => {
    Server.register({
        name: 'graphql-x',
        version: '1',
        health: () => ({ name: 'graphql-x', status: 'ok', checkedAt: new Date().toISOString() }),
        graphql: { namespace: 'x', typeDefs: 'type Query { xHealth: String! }', resolvers: { Query: { xHealth: () => 'ok' } } },
    });
    const merged = Server.mergedGraphQL();
    assert.equal(typeof merged.resolvers.Query.xHealth, 'function');
    assert.match(merged.typeDefs, /extend type Query/);
});
