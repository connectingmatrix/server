import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { createUserWorkflowNode, updateUserWorkflowNode } from '@connectingmatrix/nodes/services/workflow/user-nodes/write/mutations';
import {
  deleteUserWorkflowNode,
  getUserWorkflowNodeById,
  listUserWorkflowNodes,
} from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/queries';
import {
  exportWorkflowNodePackage,
  importWorkflowNodePackage,
  validateWorkflowNodePackage,
} from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/package-service';
import { NODE_SOURCE_RULES, reviewWorkflowNodePackageRules } from '@connectingmatrix/nodes/services/workflow/user-nodes/runtime/rules';
import { boolProp, jsonProp, schema, stringProp } from './common';
import type { GigaMcpToolGroup } from './common';

const nodeInput = (args: Record<string, unknown>) => ({
  name: args.name,
  slug: args.slug,
  description: args.description,
  groupName: args.groupName,
  nodeSchema: args.nodeSchema,
  sourceFiles: args.sourceFiles,
  scopeType: args.scopeType,
  scopeId: args.scopeId,
  organizationId: args.organizationId,
  isActive: args.isActive,
});

const ensureNodePackage = async (context: any, args: Record<string, unknown>) => {
  const slug = toSafeString(args.slug);
  if (!slug) throw new BadRequestError('slug is required.');
  const nodes = await listUserWorkflowNodes({
    currentUserId: context.userId || '',
    effectiveRoot: context.effectiveRoot === true,
    organizationId: toSafeString(args.organizationId) || null,
    scopeType: toSafeString(args.scopeType) || null,
    supabase: context.supabase,
    context,
  });
  const existing = nodes.find((node: any) => node.slug === slug);
  if (args.dryRun === true) return { action: existing ? (args.updateExisting ? 'update' : 'reuse') : 'create', existing };
  if (existing && args.updateExisting === true)
    return updateUserWorkflowNode({
      currentUserId: context.userId || '',
      effectiveRoot: context.effectiveRoot === true,
      id: existing.id,
      input: nodeInput(args),
      supabase: context.supabase,
      context,
    });
  if (existing) return existing;
  return createUserWorkflowNode({
    currentUserId: context.userId || '',
    effectiveRoot: context.effectiveRoot === true,
    input: nodeInput(args),
    supabase: context.supabase,
    context,
  });
};

export const nodeMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.list_scoped_nodes': (context, args) =>
      listUserWorkflowNodes({
        currentUserId: context.userId || '',
        effectiveRoot: context.effectiveRoot === true,
        includeInactive: args.includeInactive === true,
        organizationId: toSafeString(args.organizationId) || null,
        scopeType: toSafeString(args.scopeType) || null,
        supabase: context.supabase,
        context,
      }),
    'giga.get_scoped_node_source': (context, args) =>
      getUserWorkflowNodeById({
        currentUserId: context.userId || '',
        effectiveRoot: context.effectiveRoot === true,
        id: toSafeString(args.id),
        includeInactive: args.includeInactive === true,
        supabase: context.supabase,
        context,
      }),
    'giga.node_source_rules': async () => ({ rules: NODE_SOURCE_RULES }),
    'giga.review_node_source_rules': async (_context, args) =>
      reviewWorkflowNodePackageRules({ sourceFiles: args.sourceFiles, nodeSchema: args.nodeSchema }),
    'giga.create_scoped_node': async (context, args) =>
      args.dryRun === true
        ? {
            action: 'create',
            input: nodeInput(args),
            ruleReport: reviewWorkflowNodePackageRules({ sourceFiles: args.sourceFiles, nodeSchema: args.nodeSchema }),
          }
        : createUserWorkflowNode({
            currentUserId: context.userId || '',
            effectiveRoot: context.effectiveRoot === true,
            input: nodeInput(args),
            supabase: context.supabase,
            context,
          }),
    'giga.update_scoped_node': async (context, args) =>
      args.dryRun === true
        ? { action: 'update', id: args.id, input: nodeInput(args) }
        : updateUserWorkflowNode({
            currentUserId: context.userId || '',
            effectiveRoot: context.effectiveRoot === true,
            id: toSafeString(args.id),
            input: nodeInput(args),
            supabase: context.supabase,
            context,
          }),
    'giga.delete_scoped_node': async (context, args) =>
      args.dryRun === true
        ? { action: 'delete', id: args.id }
        : deleteUserWorkflowNode({
            currentUserId: context.userId || '',
            effectiveRoot: context.effectiveRoot === true,
            id: toSafeString(args.id),
            supabase: context.supabase,
            context,
          }),
    'giga.ensure_node_package': ensureNodePackage,
    'giga.validate_node_package': async (_context, args) =>
      validateWorkflowNodePackage(toSafeString(args.packageBase64), toSafeString(args.fileName)),
    'giga.import_node_package': async (context, args) =>
      importWorkflowNodePackage({
        currentUserId: context.userId || '',
        effectiveRoot: context.effectiveRoot === true,
        input: args,
        supabase: context.supabase,
        context,
      }),
    'giga.export_node_package': async (context, args) =>
      exportWorkflowNodePackage({
        currentUserId: context.userId || '',
        effectiveRoot: context.effectiveRoot === true,
        id: toSafeString(args.id),
        supabase: context.supabase,
        context,
      }),
  },
  tools: [
    {
      name: 'giga.list_scoped_nodes',
      description: 'List scoped custom workflow nodes visible to the user.',
      inputSchema: schema({
        organizationId: stringProp('Organization id'),
        scopeType: stringProp('USER, ORGANIZATION, GLOBAL'),
        includeInactive: boolProp('Include inactive'),
      }),
    },
    {
      name: 'giga.get_scoped_node_source',
      description: 'Read one visible scoped node including source files.',
      inputSchema: schema({ id: stringProp('Node id'), includeInactive: boolProp('Include inactive') }, ['id']),
    },
    {
      name: 'giga.node_source_rules',
      description: 'Return the strict static node source rules enforced by backend and MCP validation.',
      inputSchema: schema({}),
    },
    {
      name: 'giga.review_node_source_rules',
      description: 'Validate worker-owned node source and schema rules without writing anything.',
      inputSchema: schema({ sourceFiles: jsonProp('Source files keyed by path'), nodeSchema: jsonProp('Node schema') }, ['sourceFiles']),
    },
    {
      name: 'giga.create_scoped_node',
      description: 'Create a scoped workflow node after rule validation.',
      inputSchema: schema(
        {
          name: stringProp('Name'),
          slug: stringProp('Slug'),
          sourceFiles: jsonProp('Source files'),
          nodeSchema: jsonProp('Node schema'),
          scopeType: stringProp('Scope type'),
          organizationId: stringProp('Organization id'),
          dryRun: boolProp('Preview'),
        },
        ['name', 'sourceFiles'],
      ),
    },
    {
      name: 'giga.update_scoped_node',
      description: 'Update a scoped workflow node after rule validation.',
      inputSchema: schema(
        { id: stringProp('Node id'), sourceFiles: jsonProp('Source files'), nodeSchema: jsonProp('Node schema'), dryRun: boolProp('Preview') },
        ['id'],
      ),
    },
    {
      name: 'giga.delete_scoped_node',
      description: 'Soft-delete a scoped workflow node.',
      inputSchema: schema({ id: stringProp('Node id'), dryRun: boolProp('Preview') }, ['id']),
    },
    {
      name: 'giga.ensure_node_package',
      description: 'Idempotently create, reuse, or update a scoped node package by slug.',
      inputSchema: schema(
        {
          name: stringProp('Name'),
          slug: stringProp('Slug'),
          sourceFiles: jsonProp('Source files'),
          nodeSchema: jsonProp('Node schema'),
          scopeType: stringProp('Scope type'),
          organizationId: stringProp('Organization id'),
          updateExisting: boolProp('Update existing'),
          dryRun: boolProp('Preview'),
        },
        ['slug'],
      ),
    },
    {
      name: 'giga.validate_node_package',
      description: 'Validate a base64 .node package manifest, files, and source rules without writing anything.',
      inputSchema: schema({ packageBase64: stringProp('Base64 .node zip'), fileName: stringProp('Package file name') }, ['packageBase64']),
    },
    {
      name: 'giga.import_node_package',
      description: 'Import a validated .node package into user, organization, or global scope.',
      inputSchema: schema(
        {
          packageBase64: stringProp('Base64 .node zip'),
          fileName: stringProp('Package file name'),
          scopeType: stringProp('USER, ORGANIZATION, or GLOBAL'),
          organizationId: stringProp('Organization id'),
          duplicateStrategy: stringProp('update or copy'),
          dryRun: boolProp('Preview'),
        },
        ['packageBase64'],
      ),
    },
    {
      name: 'giga.export_node_package',
      description: 'Export a visible scoped node as a base64 .node package.',
      inputSchema: schema({ id: stringProp('Node id') }, ['id']),
    },
  ],
};
