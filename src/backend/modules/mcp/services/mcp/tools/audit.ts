import { toSafeString } from 'giga-ai-helper';
import { OrganisationEntity, UserActivityLogEntity } from '@connectingmatrix/orm/repositories/entities';
import { jsonProp, limit, schema, stringProp } from './common';
import type { GigaMcpToolGroup } from './common';

const requireOrgMembership = async (context: any, organizationId: string) => {
  if (!organizationId || context.effectiveRoot === true) return;
  await OrganisationEntity.requireAccess({
    userId: context.userId || '',
    organizationId,
    effectiveRoot: context.effectiveRoot === true,
  });
};

export const auditMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.user_activity_logs': async (context, args) => {
      const organizationId = toSafeString(args.organizationId) || null;
      if (organizationId) await requireOrgMembership(context, organizationId);
      const actor = toSafeString(args.actor);
      let query = UserActivityLogEntity.find({ user_id: context.userId || '' })
        .orderBy('created_at', 'desc')
        .limit(limit(args.limit));
      if (organizationId) query = query.where({ organization_id: organizationId });
      if (actor) query = query.where({ actor });
      return query.many();
    },
  },
  tools: [
    {
      name: 'giga.user_activity_logs',
      description: 'Read bounded user or organization activity/audit log rows visible to the caller.',
      inputSchema: schema({ organizationId: stringProp('Organization id'), actor: stringProp('Actor filter'), limit: jsonProp('Max 100') }),
    },
  ],
};
