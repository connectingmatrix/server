import { Request, Response } from 'express';
import { Body, Get, JsonController, Post, Req, Res } from 'routing-controllers';
import { Service } from 'typedi';
import { createGigaMcpContext } from '@giga/mcp/services/mcp/context';
import { callGigaMcpTool, GIGA_MCP_TOOLS } from '@giga/mcp/services/mcp/tools';
import { jsonError, jsonResult, toolContent, type McpRequest } from '@giga/mcp/services/mcp/protocol';

const serverInfo = {
  name: 'giga-master-mcp',
  version: '1.0.0',
};

@JsonController('/mcp')
@Service()
export class McpController {
  private async handleRequest(request: Request, message: McpRequest) {
    if (message.method === 'initialize') {
      return jsonResult(message.id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo,
      });
    }
    if (message.method === 'ping') return jsonResult(message.id, {});
    if (message.method === 'tools/list') return jsonResult(message.id, { tools: GIGA_MCP_TOOLS });
    if (message.method === 'tools/call') {
      if (!String(request.headers.authorization || request.headers.cookie || '').trim()) {
        return jsonError(message.id, -32001, 'Authentication is required for MCP tool calls.');
      }
      const context = await createGigaMcpContext(request);
      const name = String(message.params?.name || '').trim();
      const args =
        message.params?.arguments && typeof message.params.arguments === 'object' ? (message.params.arguments as Record<string, unknown>) : {};
      const result = await callGigaMcpTool(context, name, args);
      return jsonResult(message.id, toolContent(result));
    }
    if (message.method?.startsWith('notifications/')) return null;
    return jsonError(message.id, -32601, `Unsupported MCP method "${message.method || ''}".`);
  }

  @Get('/')
  async info(@Res() response: Response) {
    return response.json({ ...serverInfo, endpoint: '/api/v2/mcp', tools: GIGA_MCP_TOOLS.length });
  }

  @Post('/')
  async post(@Req() request: Request, @Res() response: Response, @Body() body: McpRequest | McpRequest[] = {} as McpRequest) {
    try {
      const messages = Array.isArray(body) ? body : [body];
      const results = [];
      for (const message of messages) {
        const result = await this.handleRequest(request, message || {});
        if (result) results.push(result);
      }
      if (!results.length) return response.status(202).json({ accepted: true });
      return response.json(Array.isArray(body) ? results : results[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP request failed.';
      return response.status(200).json(jsonError(Array.isArray(body) ? null : body?.id, -32000, message));
    }
  }
}
