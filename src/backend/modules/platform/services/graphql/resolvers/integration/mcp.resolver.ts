import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { callGigaMcpToolDirect, GIGA_MCP_TOOLS } from '@giga/mcp/services/mcp/tools';
import { getResolverAuthContext, GraphqlCustomResolverModule } from './base';
import type { GigaMcpContext } from '@giga/mcp/services/mcp/context';
import type { GraphqlResolverContext } from '@giga/shared/types';

@Service()
export class McpResolver extends GraphqlCustomResolverModule {
  @resolver('mcpTools', GraphQLOperationType.QUERY)
  async mcpTools() {
    return GIGA_MCP_TOOLS;
  }

  @resolver('mcpExecuteTool', GraphQLOperationType.MUTATION)
  async mcpExecuteTool({ input }: { input: { name: string; args?: Record<string, unknown> | null } }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const name = String(input?.name || '').trim();
    if (!name) throw new BadRequestError('MCP tool name is required.');
    return callGigaMcpToolDirect(context as GigaMcpContext, name, input.args || {});
  }
}
