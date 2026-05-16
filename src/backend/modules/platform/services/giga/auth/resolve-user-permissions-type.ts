import { UserPermissionsEntity } from '@connectingmatrix/orm/repositories/graph-entities';
import { USER_PERMISSIONS_TYPES, UserPermissionsType } from '@giga/shared/types/contracts/graph.types';

const VALID_PERMISSION_TYPES = new Set<UserPermissionsType>([
  USER_PERMISSIONS_TYPES.user,
  USER_PERMISSIONS_TYPES.organization,
  USER_PERMISSIONS_TYPES.group,
  USER_PERMISSIONS_TYPES.system,
]);

const userPermissionsTypeCache = new Map<string, Promise<UserPermissionsType>>();

async function readUserPermissionsType(userPermissionsId: string): Promise<UserPermissionsType> {
  const userPermissions = await new UserPermissionsEntity({
    id: userPermissionsId,
    kind: USER_PERMISSIONS_TYPES.user,
  }).load();

  const kind = userPermissions?.kind;
  if (kind && VALID_PERMISSION_TYPES.has(kind as UserPermissionsType)) {
    return kind as UserPermissionsType;
  }

  return USER_PERMISSIONS_TYPES.user;
}

export async function resolveUserPermissionsType(userPermissionsId: string): Promise<UserPermissionsType> {
  const cached = userPermissionsTypeCache.get(userPermissionsId);
  if (cached) return cached;
  const pending = readUserPermissionsType(userPermissionsId);
  userPermissionsTypeCache.set(userPermissionsId, pending);
  return pending;
}
