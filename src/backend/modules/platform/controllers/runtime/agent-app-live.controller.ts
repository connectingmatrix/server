import { Body, Delete, Get, JsonController, Param, Patch, Post, Req, Res } from 'routing-controllers';
import { Service } from 'typedi';
import { z } from 'zod';
import { buildGeneratedAppFrameHtml, readDeploymentFile, readGeneratedAppApiResponse } from '@connectingmatrix/ai-agents/services/ai-agents/app-hosting';
import type { Request, Response } from 'express';

const hostManifestSchema = z
  .object({ appId: z.string().optional(), deploymentId: z.string().optional(), appName: z.string().optional() })
  .passthrough();

@JsonController('/agent-apps')
@Service()
export class AgentAppLiveController {
  @Get('/live/:deploymentId')
  async readIndex(@Param('deploymentId') deploymentId: string, @Res() response: Response) {
    const file = await readDeploymentFile(deploymentId, '__giga/manifest.json');
    if (!file) return response.status(404).json({ error: 'Deployment not found.' });
    response.setHeader('Content-Type', 'text/html');
    return response.send(buildGeneratedAppFrameHtml(deploymentId, hostManifestSchema.parse(JSON.parse(file.content.toString('utf8')))));
  }

  @Get('/live/:deploymentId/api/:operation')
  async readCompatibilityApi(@Param('deploymentId') deploymentId: string, @Param('operation') operation: string, @Res() response: Response) {
    return this.compatibilityApi(deploymentId, operation, 'GET', undefined, response);
  }

  @Post('/live/:deploymentId/api/:operation')
  async createCompatibilityApi(
    @Param('deploymentId') deploymentId: string,
    @Param('operation') operation: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    return this.compatibilityApi(deploymentId, operation, 'POST', body, response);
  }

  @Patch('/live/:deploymentId/api/:operation')
  async updateCompatibilityApi(
    @Param('deploymentId') deploymentId: string,
    @Param('operation') operation: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    return this.compatibilityApi(deploymentId, operation, 'PATCH', body, response);
  }

  @Delete('/live/:deploymentId/api/:operation')
  async deleteCompatibilityApi(
    @Param('deploymentId') deploymentId: string,
    @Param('operation') operation: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    return this.compatibilityApi(deploymentId, operation, 'DELETE', body, response);
  }

  @Get('/live/:deploymentId/*')
  async readAsset(@Param('deploymentId') deploymentId: string, @Req() request: Request, @Res() response: Response) {
    const marker = `/live/${deploymentId}/`;
    const url = request.originalUrl || request.path;
    const requestedPath = url.includes(marker) ? url.slice(url.indexOf(marker) + marker.length).split('?')[0] : 'index.html';
    if (!requestedPath) return this.readIndex(deploymentId, response);
    if (requestedPath === '__app' || requestedPath === '__app/') return this.sendDeploymentFile(deploymentId, '__app/index.html', response);
    if (requestedPath.startsWith('__app/api/')) return this.compatibilityApi(deploymentId, requestedPath.slice(10), 'GET', undefined, response);
    if (requestedPath.startsWith('__app/')) return this.sendDeploymentFile(deploymentId, requestedPath.slice(6) || 'index.html', response);
    if (requestedPath.startsWith('api/')) return this.compatibilityApi(deploymentId, requestedPath.slice(4), 'GET', undefined, response);
    return this.sendDeploymentFile(deploymentId, requestedPath || 'index.html', response);
  }

  private async sendDeploymentFile(deploymentId: string, path: string, response: Response) {
    const file = await readDeploymentFile(deploymentId, path);
    if (!file) return response.status(404).json({ error: 'Deployment file not found.' });
    response.setHeader('Content-Type', file.contentType);
    return response.send(file.content);
  }

  private async compatibilityApi(deploymentId: string, operation: string, method: string, body: unknown, response: Response) {
    const result = await readGeneratedAppApiResponse(deploymentId, operation, method, body);
    return response.status(result.status).json(result.body);
  }
}
