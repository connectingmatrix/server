import '@giga/shared/test/dom-polyfills';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCESS_RELATIONS, RESOURCE_TYPES, USER_PERMISSIONS_TYPES } from '@giga/shared/types/contracts/graph.types';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import { attachUserPermissions } from '@giga/general/services/giga/auth/attach-user-permissions';
import type { QueryCall } from '@giga/shared/types/contracts/graphql.types';

function createNeoMock(options: { existingGrantedAt?: string } = {}) {
  const calls: QueryCall[] = [];

  const neo = {
    run: async (statement: string, params: Record<string, unknown> = {}) => {
      calls.push({ statement, params });

      if (statement.includes('RETURN count(node) > 0 AS exists')) {
        return [{ exists: true }];
      }

      if (statement.includes('RETURN target.id AS resourceId')) {
        return [{ resourceId: params.resourceId }];
      }

      if (
        statement.includes('MATCH (source:UserPermissions') &&
        statement.includes('RETURN properties(rel) AS props') &&
        statement.includes('LIMIT 1')
      ) {
        return options.existingGrantedAt ? [{ props: { grantedAt: options.existingGrantedAt } }] : [];
      }

      if (statement.includes('MERGE (node:')) {
        return [{ props: params.props }];
      }

      if (statement.includes('MERGE (source)-[rel:OWNS]->(target)') || statement.includes('MERGE (source)-[rel:CAN_ACCESS]->(target)')) {
        return [{ props: params.onCreateProps }];
      }

      return [];
    },
  } as any;

  return { neo, calls };
}

test('attachUserPermissions strips nullable relationship props on create path', async () => {
  const original = Neo4JConnection.getInstance;
  const { neo, calls } = createNeoMock();
  (Neo4JConnection as any).getInstance = async () => neo;

  try {
    const payload = await attachUserPermissions({
      userPermissionsId: 'u-1',
      userPermissionsType: USER_PERMISSIONS_TYPES.user,
      resourceId: 'res-channel',
      resourceType: RESOURCE_TYPES.channel,
      grantType: ACCESS_RELATIONS.owns,
      permissions: {
        read: true,
        write: true,
        recursive: true,
        availableFrom: null as any,
        availableTo: null as any,
        shareMode: null as any,
        grantedByUserPermissionsId: null as any,
      },
      permissionProfile: null as any,
    } as any);

    assert.equal(payload.grantType, ACCESS_RELATIONS.owns);

    const relationCall = calls.find((call) => call.statement.includes('MERGE (source)-[rel:OWNS]->(target)'));
    assert.ok(relationCall, 'expected relation MERGE query to run');
    const onCreateProps = relationCall?.params.onCreateProps as Record<string, unknown>;
    const onMatchProps = relationCall?.params.onMatchProps as Record<string, unknown>;

    assert.equal('availableFrom' in onCreateProps, false);
    assert.equal('availableTo' in onCreateProps, false);
    assert.equal('shareMode' in onCreateProps, false);
    assert.equal('permissionProfileId' in onCreateProps, false);
    assert.equal('grantedByUserPermissionsId' in onCreateProps, false);

    assert.equal('availableFrom' in onMatchProps, false);
    assert.equal('availableTo' in onMatchProps, false);
    assert.equal('shareMode' in onMatchProps, false);
    assert.equal('permissionProfileId' in onMatchProps, false);
    assert.equal('grantedByUserPermissionsId' in onMatchProps, false);
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test('attachUserPermissions preserves grantedAt when relation already exists', async () => {
  const original = Neo4JConnection.getInstance;
  const existingGrantedAt = '2026-01-01T00:00:00.000Z';
  const { neo, calls } = createNeoMock({ existingGrantedAt });
  (Neo4JConnection as any).getInstance = async () => neo;

  try {
    const payload = await attachUserPermissions({
      userPermissionsId: 'u-1',
      userPermissionsType: USER_PERMISSIONS_TYPES.user,
      resourceId: 'res-channel',
      resourceType: RESOURCE_TYPES.channel,
      grantType: ACCESS_RELATIONS.canAccess,
      permissions: {
        read: true,
        write: true,
        recursive: true,
        availableFrom: null as any,
        availableTo: null as any,
        shareMode: null as any,
        grantedByUserPermissionsId: null as any,
      },
      permissionProfile: null as any,
    } as any);

    assert.equal(payload.grantType, ACCESS_RELATIONS.canAccess);

    const relationCall = calls.find((call) => call.statement.includes('MERGE (source)-[rel:CAN_ACCESS]->(target)'));
    assert.ok(relationCall, 'expected relation MERGE query to run');
    const onCreateProps = relationCall?.params.onCreateProps as Record<string, unknown>;
    const onMatchProps = relationCall?.params.onMatchProps as Record<string, unknown>;
    assert.equal(typeof onCreateProps.grantedAt, 'string');
    assert.equal('grantedAt' in onMatchProps, false);
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});
