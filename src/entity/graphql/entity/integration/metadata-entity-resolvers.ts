import * as Entities from '@connectingmatrix/orm/repositories/entities';
import { createEntityGraphQLLoaders, graphQLId } from './entity-dataloaders';

type ResolverMap = Record<string, Record<string, (...args: unknown[]) => unknown>>;
const entities = Entities as unknown as Record<string, Record<string, unknown>>;
const text = (value: unknown): string => String(value ?? '').trim();
const entityName = (exportName: string): string => exportName.replace(/Entity$/i, '');

const relationNames = (Entity: Record<string, unknown>): string[] => {
  const metadata = Entity.__relations || Entity.relations || Entity.relationMetadata;
  if (Array.isArray(metadata))
    return metadata.map((item) => text((item as Record<string, unknown>).name || (item as Record<string, unknown>).property || item)).filter(Boolean);
  if (metadata && typeof metadata === 'object') return Object.keys(metadata as Record<string, unknown>);
  return [];
};

const defaultRelations: Record<string, string[]> = {
  User: ['workflows', 'channels', 'chats', 'credentials', 'organisations'],
  Organisation: ['workflows', 'channels', 'sharedSpaces', 'members'],
  Organization: ['workflows', 'channels', 'sharedSpaces', 'members'],
  Channel: ['children', 'categories', 'subjects', 'posts', 'workflows'],
  Category: ['subjects', 'posts', 'children'],
  Subject: ['posts', 'children'],
  Post: ['attachments'],
  Workflow: ['executions', 'versions', 'logs'],
  WorkflowExecution: ['logs', 'events'],
  Chat: ['messages', 'attachments'],
};

export const createMetadataEntityResolvers = (): ResolverMap => {
  const resolvers: ResolverMap = {};
  for (const [exportName, Entity] of Object.entries(entities)) {
    if (!/Entity$/.test(exportName) || typeof Entity !== 'function') continue;
    const name = entityName(exportName);
    const relations = Array.from(new Set([...(defaultRelations[name] || []), ...relationNames(Entity)]));
    if (!relations.length) continue;
    resolvers[name] = resolvers[name] || {};
    for (const relation of relations) {
      resolvers[name][relation] = async (parent: unknown, args: Record<string, unknown> = {}, context: Record<string, unknown> = {}) => {
        const loaders = (context.entityLoaders ||= createEntityGraphQLLoaders()) as ReturnType<typeof createEntityGraphQLLoaders>;
        const rows = await loaders.relation(name, relation).load(graphQLId(parent));
        if (args?.first && Array.isArray(rows)) return rows.slice(0, Number(args.first));
        return rows;
      };
    }
  }
  return resolvers;
};
