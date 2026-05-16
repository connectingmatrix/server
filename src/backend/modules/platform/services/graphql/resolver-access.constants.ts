/**
 * Canonical permission strings and context keys for the manifest access layer.
 * Every resolver manifest entry, target resolver, and middleware check uses these constants
 * so permission names stay consistent across runtime checks, UI metadata, and cached context.
 * It also exposes the typed reader for permission results stored on GraphQL context.
 */
import type { GraphqlResolverContext } from '@giga/shared/types';
import type { OrganizationAction, OrganizationModule } from '@giga/shared/types/contracts/org.types';
import type { PermissionContextValueMap } from '@giga/shared/types/auth/permissions.types';

export type OrganizationPermission = `${OrganizationModule}.${OrganizationAction}`;

function group(module: OrganizationModule) {
  return {
    CREATE: `${module}.create` as OrganizationPermission,
    READ: `${module}.read` as OrganizationPermission,
    UPDATE: `${module}.update` as OrganizationPermission,
    DELETE: `${module}.delete` as OrganizationPermission,
    EXECUTE: `${module}.execute` as OrganizationPermission,
  };
}

export const ORG = {
  CHANNEL: group('CHANNEL'),
  CATEGORY: group('CATEGORY'),
  SUBJECT: group('SUBJECT'),
  WEBHOOK: group('WEBHOOK'),
  LINKING: group('LINKING'),
  SHARING: group('SHARING'),
  POST: group('POST'),
  CHANNEL_CHAT: group('CHANNEL_CHAT'),
  CATEGORY_CHAT: group('CATEGORY_CHAT'),
  SUBJECT_CHAT: group('SUBJECT_CHAT'),
  POST_CHAT: group('POST_CHAT'),
  WORKFLOW: group('WORKFLOW'),
  ATTACH_WORKFLOW: group('ATTACH_WORKFLOW'),
  IMPORT_WORKFLOW_FROM_CATALOG: group('IMPORT_WORKFLOW_FROM_CATALOG'),
  WORKFLOW_AI_PERMISSIONS: group('WORKFLOW_AI_PERMISSIONS'),
  NODE_DESIGNER: group('NODE_DESIGNER'),
  CREDENTIAL: group('CREDENTIAL'),
  ORG_WORKFLOWS: group('ORG_WORKFLOWS'),
} as const;

export enum PermissionContextKey {
  ORGANIZATION_ACCESS = 'ORGANIZATION_ACCESS',
}

export function getPermissionContextOrThrow<TKey extends PermissionContextKey>(
  context: GraphqlResolverContext,
  key: TKey,
): PermissionContextValueMap[TKey] {
  const value = context.organizationPermissionResults?.[key];
  if (!value) throw new Error(`Permission context ${String(key)} is not available.`);
  return value as PermissionContextValueMap[TKey];
}
