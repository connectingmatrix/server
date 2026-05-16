import { BadRequestError } from 'routing-controllers';
import { readUserMatrixState } from '@giga/permissions/manifest/user-matrix';
import { buildPermissionContext } from '@giga/permissions/services/auth/permission-context';
import { getOrganizationAccessContext } from '@giga/general/services/organization/access';
import type { GraphqlResolverContext } from '@giga/shared/types';
import type { CredentialAccess, CredentialScope } from '@giga/general/services/credentials/contracts/types';

type AccessInput = {
  currentUserId: string;
  effectiveRoot: boolean;
  scope: CredentialScope;
  organizationId?: string | null;
  activeOrganizationId?: string | null;
  resolvePermissionContext: (organizationId?: string | null) => Promise<ReturnType<typeof buildPermissionContext>>;
  resolveOrganizationAccessContext: (organizationId: string) => ReturnType<typeof getOrganizationAccessContext>;
};

function deny(message: string): never {
  throw new BadRequestError(message);
}

function readOrganizationId(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

async function buildCredentialAccess(input: AccessInput): Promise<CredentialAccess> {
  if (input.scope === 'GLOBAL') {
    const permissions = input.effectiveRoot
      ? null
      : await input.resolvePermissionContext(readOrganizationId(input.organizationId) || readOrganizationId(input.activeOrganizationId));

    if (!input.effectiveRoot && !permissions?.CAN_ACCESS_GLOABL_CREDENTIALS) {
      deny('Insufficient permissions for global credentials.');
    }

    return {
      scope: 'GLOBAL',
      organizationId: null,
      userId: null,
      canCreate: input.effectiveRoot || Boolean(permissions && permissions.GLOBAL_CREDENTIALS_CREATE !== 0),
      canReadSecrets: input.effectiveRoot || Boolean(permissions && permissions.GLOBAL_CREDENTIALS_READ !== 0),
      canUpdate: input.effectiveRoot || Boolean(permissions && permissions.GLOBAL_CREDENTIALS_UPDATE !== 0),
      canDelete: input.effectiveRoot || Boolean(permissions && permissions.GLOBAL_CREDENTIALS_DELETE !== 0),
      canExecute: input.effectiveRoot || Boolean(permissions && permissions.GLOBAL_CREDENTIALS_EXECUTE !== 0),
      canActivate: input.effectiveRoot || Boolean(permissions && permissions.GLOBAL_CREDENTIALS_UPDATE !== 0),
    };
  }

  if (input.scope === 'PERSONAL') {
    return {
      scope: 'PERSONAL',
      organizationId: null,
      userId: input.currentUserId,
      canCreate: true,
      canReadSecrets: true,
      canUpdate: true,
      canDelete: true,
      canExecute: true,
      canActivate: true,
    };
  }

  const organizationId = String(input.organizationId || '').trim();
  if (!organizationId) {
    deny('organizationId is required for organization credentials.');
  }

  const actorContext = await input.resolveOrganizationAccessContext(organizationId);
  const permissions = await input.resolvePermissionContext(organizationId);

  return {
    scope: 'ORGANIZATION',
    organizationId,
    userId: null,
    canCreate: actorContext.isSuperAdmin || permissions.CAN_CREATE_CREDENTIAL,
    canReadSecrets: actorContext.isSuperAdmin || permissions.CAN_READ_CREDENTIAL,
    canUpdate: actorContext.isSuperAdmin || permissions.CAN_UPDATE_CREDENTIAL,
    canDelete: actorContext.isSuperAdmin || permissions.CAN_DELETE_CREDENTIAL,
    canExecute: actorContext.isSuperAdmin || permissions.CAN_EXECUTE_CREDENTIAL,
    canActivate: actorContext.isSuperAdmin || permissions.CAN_UPDATE_CREDENTIAL,
  };
}

export async function resolveCredentialAccess(input: {
  context: GraphqlResolverContext;
  currentUserId: string;
  effectiveRoot: boolean;
  scope: CredentialScope;
  organizationId?: string | null;
}): Promise<CredentialAccess> {
  return buildCredentialAccess({
    currentUserId: input.currentUserId,
    effectiveRoot: input.effectiveRoot,
    scope: input.scope,
    organizationId: input.organizationId,
    activeOrganizationId: input.context.userMatrixState?.organizationId || null,
    resolvePermissionContext: async (organizationId) =>
      buildPermissionContext(
        await readUserMatrixState(input.context.supabase, {
          effectiveRoot: input.effectiveRoot,
          organizationId: readOrganizationId(organizationId),
          userId: input.currentUserId,
        }),
        input.effectiveRoot === true,
      ),
    resolveOrganizationAccessContext: (organizationId) => getOrganizationAccessContext(input.context.supabase, input.currentUserId, organizationId),
  });
}

export async function resolveRuntimeCredentialAccess(input: {
  supabase: GraphqlResolverContext['supabase'];
  currentUserId: string;
  effectiveRoot: boolean;
  scope: CredentialScope;
  organizationId?: string | null;
}): Promise<CredentialAccess> {
  return buildCredentialAccess({
    currentUserId: input.currentUserId,
    effectiveRoot: input.effectiveRoot,
    scope: input.scope,
    organizationId: input.organizationId,
    resolvePermissionContext: async (organizationId) =>
      buildPermissionContext(
        await readUserMatrixState(input.supabase, {
          effectiveRoot: input.effectiveRoot,
          organizationId: readOrganizationId(organizationId),
          userId: input.currentUserId,
        }),
        input.effectiveRoot === true,
      ),
    resolveOrganizationAccessContext: (organizationId) => getOrganizationAccessContext(input.supabase, input.currentUserId, organizationId),
  });
}

export function assertCredentialQueryAllowed(access: CredentialAccess): void {
  if (!access.canReadSecrets && !access.canExecute && !access.canCreate && !access.canUpdate && !access.canDelete && !access.canActivate) {
    throw new BadRequestError('Insufficient permissions for credential access.');
  }
}

export function assertCredentialMutationAllowed(access: CredentialAccess, action: 'create' | 'update' | 'delete' | 'activate'): void {
  const allowed =
    action === 'create' ? access.canCreate : action === 'update' ? access.canUpdate : action === 'delete' ? access.canDelete : access.canActivate;

  if (!allowed) {
    throw new BadRequestError(`Insufficient permissions for credential ${action}.`);
  }
}

export function assertCredentialExecutionAllowed(access: CredentialAccess): void {
  if (!access.canExecute && !access.canReadSecrets) {
    throw new BadRequestError('Insufficient permissions for credential execution.');
  }
}
