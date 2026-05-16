import { EntityRequestContext } from '@connectingmatrix/orm/orm/request-entity-context';
import * as Entities from '@connectingmatrix/orm/repositories/entities';

type ResolverFn = (
  parent: Record<string, unknown>,
  args: Record<string, unknown>,
  context: Record<string, unknown>,
  info: unknown,
) => Promise<unknown> | unknown;
type ResolverMap = Record<string, Record<string, ResolverFn>>;

type EntityClass = {
  load?: (id?: string) => unknown;
  find?: (where?: Record<string, unknown>) => { many?: () => Promise<unknown[]>; single?: () => Promise<unknown> };
  single?: (where?: string | Record<string, unknown>) => Promise<unknown>;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => String(value ?? '').trim();
const entityExports = Entities as unknown as Record<string, EntityClass>;
const User = Entities.UserEntity;
const Organisation = Entities.OrganisationEntity;
const entityByGraphQLType = (typeName: string): EntityClass | null => entityExports[`${typeName}Entity`] || entityExports[typeName] || null;
const primaryId = (parent: Record<string, unknown>): string =>
  text(parent.id || parent.user_id || parent.organization_id || parent.workflow_id || parent.chat_id);

const withGraphqlEntityContext = async <T>(context: Record<string, unknown>, callback: () => Promise<T> | T): Promise<T> => {
  if (EntityRequestContext.maybeCurrent()) return callback();
  return EntityRequestContext.fromRequest({ request: context.request as never, supabase: context.supabase as never }, callback);
};

const resolveRelation = async (
  parentType: string,
  relation: string,
  parent: Record<string, unknown>,
  args: Record<string, unknown>,
  context: Record<string, unknown>,
) =>
  withGraphqlEntityContext(context, async () => {
    const Parent = entityByGraphQLType(parentType);
    if (!Parent?.load) return [];
    const id = text(args.parentId || args.id || primaryId(parent));
    if (!id) return [];
    const ref = Parent.load(id) as Record<string, unknown>;
    const manager = ref[relation] as
      | {
          find?: (where?: Record<string, unknown>) => { many?: () => Promise<unknown[]>; single?: () => Promise<unknown> };
          list?: () => Promise<unknown[]>;
          many?: () => Promise<unknown[]>;
        }
      | undefined;
    if (!manager) return [];
    if (typeof manager.find === 'function') return manager.find(record(args.where)).many?.() || [];
    if (typeof manager.many === 'function') return manager.many();
    if (typeof manager.list === 'function') return manager.list();
    return [];
  });

const entitySingle = async (typeName: string, parent: Record<string, unknown>, args: Record<string, unknown>, context: Record<string, unknown>) =>
  withGraphqlEntityContext(context, async () => {
    const Entity = entityByGraphQLType(typeName);
    if (!Entity) return null;
    const id = text(args.id || primaryId(parent));
    if (id && Entity.single) return Entity.single(id);
    if (Entity.find) return Entity.find(record(args.where || args)).single?.() || null;
    return null;
  });

const entityMany = async (typeName: string, args: Record<string, unknown>, context: Record<string, unknown>) =>
  withGraphqlEntityContext(context, async () => {
    const Entity = entityByGraphQLType(typeName);
    if (!Entity?.find) return [];
    return Entity.find(record(args.where || args)).many?.() || [];
  });

const userOwnedRows = (parent: Record<string, unknown>, context: Record<string, unknown>, read: (userId: string) => Promise<unknown[]>) =>
  withGraphqlEntityContext(context, async () => {
    const userId = primaryId(parent);
    if (!userId) return [];
    return read(userId);
  });

export const entityFieldResolvers: ResolverMap = {
  User: {
    workflows: (parent, args, context) => resolveRelation('User', 'workflows', parent, args, context),
    channels: (parent, args, context) => resolveRelation('User', 'channels', parent, args, context),
    credentials: (parent, args, context) => resolveRelation('User', 'credentials', parent, args, context),
    chats: (parent, args, context) => resolveRelation('User', 'chats', parent, args, context),
    organisations: (parent, _args, context) =>
      userOwnedRows(parent, context, (userId) => Organisation.listForUser({ userId, id: null, slug: null, isActive: null })),
    categories: (parent, _args, context) => userOwnedRows(parent, context, (userId) => User.categoriesByUserId(userId)),
    subjects: (parent, _args, context) => userOwnedRows(parent, context, (userId) => User.subjectsByUserId(userId)),
  },
  Organisation: {
    workflows: (parent, args, context) => resolveRelation('Organisation', 'workflows', parent, args, context),
    channels: (parent, args, context) => resolveRelation('Organisation', 'channels', parent, args, context),
    globalChannels: (parent, args, context) => resolveRelation('Organisation', 'globalChannels', parent, args, context),
    sharedSpace: (parent, args, context) => resolveRelation('Organisation', 'sharedSpace', parent, args, context),
    members: (parent, args, context) => resolveRelation('Organisation', 'members', parent, args, context),
  },
  Workflow: {
    versions: (parent, args, context) => resolveRelation('Workflow', 'versions', parent, args, context),
    executions: (parent, args, context) => resolveRelation('Workflow', 'executions', parent, args, context),
    attachments: (parent, args, context) => resolveRelation('Workflow', 'attachments', parent, args, context),
    logs: (parent, args, context) => resolveRelation('Workflow', 'logs', parent, args, context),
  },
  WorkflowExecution: {
    logs: (parent, args, context) => resolveRelation('WorkflowExecution', 'logs', parent, args, context),
    events: (parent, args, context) => resolveRelation('WorkflowExecution', 'events', parent, args, context),
  },
  Chat: {
    messages: (parent, args, context) => resolveRelation('Chat', 'messages', parent, args, context),
    shares: (parent, args, context) => resolveRelation('Chat', 'shares', parent, args, context),
    attachments: (parent, args, context) => resolveRelation('Chat', 'attachments', parent, args, context),
  },
  Channel: {
    children: (parent, args, context) => resolveRelation('Channel', 'children', parent, args, context),
    categories: (parent, args, context) => resolveRelation('Channel', 'categories', parent, args, context),
  },
  Category: {
    subjects: (parent, args, context) => resolveRelation('Category', 'subjects', parent, args, context),
  },
  Subject: {
    posts: (parent, args, context) => resolveRelation('Subject', 'posts', parent, args, context),
  },
  Global: {
    channels: (parent, args, context) => resolveRelation('Global', 'channels', parent, args, context),
  },
};

export const mergeEntityFieldResolvers = (existing: ResolverMap = {}): ResolverMap => {
  const merged: ResolverMap = { ...existing };
  for (const [typeName, fields] of Object.entries(entityFieldResolvers)) {
    merged[typeName] = { ...(entityFieldResolvers[typeName] || {}), ...(existing[typeName] || {}) };
    for (const [fieldName, resolver] of Object.entries(fields)) {
      if (!existing[typeName]?.[fieldName]) merged[typeName][fieldName] = resolver;
    }
  }
  return merged;
};
