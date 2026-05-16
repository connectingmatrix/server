import { OrganisationEntity, UserEntity } from '@connectingmatrix/orm/repositories/entities';
import { schema } from './common';
import type { GigaMcpContext } from '../context';
import type { GigaMcpToolGroup } from './common';

const visibleOrganizations = async (context: GigaMcpContext) => {
  const access = await OrganisationEntity.accessForUser({
    userId: context.userId || '',
    effectiveRoot: context.effectiveRoot === true,
  });
  if (access.effectiveRoot) return OrganisationEntity.find({ isActive: true }).many();
  if (!access.organizationIds.length) return [];
  return OrganisationEntity.find({ isActive: true }).whereIn('id', access.organizationIds).many();
};

export const identityMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.me': async (context) => {
      const user = context.userId ? await UserEntity.profile(context.userId).catch(() => null) : null;
      return {
        user: user || { id: context.userId },
        effectiveRoot: context.effectiveRoot === true,
        organizations: await visibleOrganizations(context),
      };
    },
  },
  tools: [
    {
      name: 'giga.me',
      description: 'Return the authenticated Giga user, root state, and visible organizations.',
      inputSchema: schema({}),
    },
  ],
};
