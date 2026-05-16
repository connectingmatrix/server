import { toSafeString } from 'giga-ai-helper';
import { UserActivityLogEntity } from '@connectingmatrix/orm/repositories/entities/telemetry/UserActivityLogEntity';
import type { GigaMcpContext } from './context';

const eventFor = (toolName: string) => {
  if (/delete|remove/.test(toolName)) return 'DELETE';
  if (/execute|query_chat/.test(toolName)) return 'EXECUTE';
  if (/create|ensure|write|download|copy|move|update|import/.test(toolName)) return 'UPDATE';
  return null;
};

export const writeMcpActivityLog = async (context: GigaMcpContext, toolName: string, args: Record<string, unknown>) => {
  const event = eventFor(toolName);
  if (!event || !context.userId) return;
  const organizationId = toSafeString(args.organizationId || args.scopeId);
  await UserActivityLogEntity.create({
    user_id: context.userId,
    actor_user_id: context.userId,
    organization_id: organizationId || null,
    event,
    actor: toolName,
    subject: toSafeString(args.id || args.path || args.slug || args.workflowId || args.scopeId) || toolName,
    metadata: {
      source: 'mcp',
      toolName,
      dryRun: args.dryRun === true,
    },
  });
};
