import { BadRequestError, UnauthorizedError } from 'routing-controllers';
import { GigaORM } from '@connectingmatrix/orm/orm';
import { OrganizationMemberEntity, OrganisationEntity } from '@connectingmatrix/orm/repositories/entities';
import { getResolverAuthContext } from '@giga/general/services/graphql/resolvers/integration/base';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';
import type { RuntimeMonitorInput, RuntimeMonitorScope } from './runtime-monitor.types';

const readText = (value?: string | null) => String(value || '').trim();
const isAdminRole = (value?: string | null) =>
  ['ADMIN', 'SUPER_ADMIN'].includes(
    String(value || '')
      .trim()
      .toUpperCase(),
  );

async function readOrganizationScope(organizationId: string): Promise<{ label: string; userIds: string[] }> {
  return GigaORM.run({ caller: { id: 'runtime-monitor-scope', type: 'root' } }, async () => {
    const org = await OrganisationEntity.find({ id: organizationId }).select('id,name').single();
    const members = await OrganizationMemberEntity.find({ organization_id: organizationId, is_disabled: false }).select('user_id').many();
    const userIds = members.map((row) => readText(row.user_id)).filter(Boolean);
    return { label: readText(org?.name) || organizationId, userIds };
  });
}

export async function resolveRuntimeMonitorScope(ctx: GraphqlResolverContext, input: RuntimeMonitorInput): Promise<RuntimeMonitorScope> {
  const auth = await getResolverAuthContext(ctx);
  const callerUserId = readText(auth.userId);
  if (!callerUserId) throw new UnauthorizedError('Caller is required for runtime monitor.');

  const organizationId = readText(input.organizationId);
  const requestedUserId = readText(input.userId);

  if (auth.effectiveRoot) {
    if (!organizationId) {
      if (requestedUserId) {
        return { mode: 'root', callerUserId, organizationId: null, visibleUserIds: [requestedUserId], scopeLabel: `Root: user ${requestedUserId}` };
      }
      return { mode: 'root', callerUserId, organizationId: null, visibleUserIds: null, scopeLabel: 'Root: all users' };
    }
    const orgScope = await readOrganizationScope(organizationId);
    return { mode: 'orgAdmin', callerUserId, organizationId, visibleUserIds: orgScope.userIds, scopeLabel: `Organization: ${orgScope.label}` };
  }

  if (organizationId) {
    const membership = await GigaORM.run({ caller: { id: 'runtime-monitor-scope', type: 'root' } }, async () =>
      OrganizationMemberEntity.find({
        organization_id: organizationId,
        user_id: callerUserId,
        is_disabled: false,
      })
        .select('id,role')
        .single(),
    );
    if (!membership?.id || !isAdminRole(membership.role)) throw new BadRequestError('Access denied for this organization monitor.');
    const orgScope = await readOrganizationScope(organizationId);
    return { mode: 'orgAdmin', callerUserId, organizationId, visibleUserIds: orgScope.userIds, scopeLabel: `Organization: ${orgScope.label}` };
  }

  if (requestedUserId && requestedUserId !== callerUserId) throw new BadRequestError('Access denied for requested user monitor.');
  return { mode: 'user', callerUserId, organizationId: null, visibleUserIds: [callerUserId], scopeLabel: 'Personal runtime monitor' };
}
