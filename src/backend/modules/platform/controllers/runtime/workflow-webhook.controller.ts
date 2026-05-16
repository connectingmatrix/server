import { createRunId } from 'giga-ai-helper/workflow';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Post, Req, Res } from 'routing-controllers';
import { Executor } from '@workflow/executor';
import { Service } from 'typedi';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganisationEntity';
import { assertBillingExecutionAccess } from '@connectingmatrix/orm/repositories/entities';
import { createPendingWebhookTestRequest, getWorkflowEditorSession } from '@connectingmatrix/sockets/workflow/editor-presence';
import {
  applyWebhookRequestToWorkflow,
  buildWorkflowWebhookRequest,
  loadPersistedWorkflowRecord,
  type PersistedWorkflowRecord,
  resolveExecutionWorkflow,
  requiresWorkflowWebhookSecret,
  validateWorkflowWebhookInvocation,
  verifyWorkflowSecret,
} from '@connectingmatrix/workflow-driver/services/workflow/runtime/webhook';
import {
  createQueuedWebhookWorkflowExecution,
  executeQueuedWebhookWorkflow,
  loadWorkflowWebhookExecutionStatus,
} from '@connectingmatrix/workflow-driver/services/workflow/queue';
import { assertAIPolicyCreditsAvailableDirect, recordAIPolicyUsageDirect } from '@giga/plan-policy/services/plan-policy/runtime/usage';
import { assertPlanPolicyPermissionDirect, readWorkflowRuntimeLimitsDirect } from '@giga/plan-policy/services/plan-policy/runtime/enforcement';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';

async function resolveOwnerId(adminSupabase: any, record: PersistedWorkflowRecord) {
  if (record.userId) {
    return record.userId;
  }

  if (!record.organizationId) {
    return '';
  }

  const organization = await OrganisationEntity.readCreatedByById(record.organizationId);
  return String(organization?.createdBy || '').trim();
}

function createWebhookErrorPayload(routeType: 'test' | 'published', error: string) {
  return routeType === 'test' ? { error, logs: [] } : { error };
}

@JsonController('/workflows')
@Service()
export class WorkflowWebhookController {
  private async resolveWebhookInvocation(request: Request, response: Response, workflowId: string, routeType: 'test' | 'published') {
    const adminSupabase = SupabaseClientAdmin();
    const record = await loadPersistedWorkflowRecord(adminSupabase, workflowId);

    if (!record || !record.isActive) {
      response.status(404).json(createWebhookErrorPayload(routeType, 'Workflow not found.'));
      return null;
    }

    const providedSecret =
      typeof request.headers['x-workflow-secret'] === 'string'
        ? request.headers['x-workflow-secret']
        : Array.isArray(request.headers['x-workflow-secret'])
        ? request.headers['x-workflow-secret'][0]
        : '';

    if (requiresWorkflowWebhookSecret(routeType) && !verifyWorkflowSecret(record, providedSecret)) {
      response.status(401).json(createWebhookErrorPayload(routeType, 'Invalid workflow secret.'));
      return null;
    }

    const executionWorkflow = resolveExecutionWorkflow(record, routeType);
    if (!executionWorkflow) {
      const error = routeType === 'published' ? 'Published workflow not found.' : 'Draft workflow not found.';
      response.status(404).json(createWebhookErrorPayload(routeType, error));
      return null;
    }

    const validation = validateWorkflowWebhookInvocation(executionWorkflow, request.method);
    if (validation.ok !== true) {
      response.status(validation.status).json(createWebhookErrorPayload(routeType, validation.error));
      return null;
    }

    const webhookRequest = buildWorkflowWebhookRequest(request, routeType);
    const ownerUserId = await resolveOwnerId(adminSupabase, record);
    const organizationId = record.organizationId || null;
    if (ownerUserId) {
      await assertPlanPolicyPermissionDirect(adminSupabase, {
        action: 'execute',
        module: 'WEBHOOK',
        organizationId,
        userId: ownerUserId,
      });
      await assertAIPolicyCreditsAvailableDirect(adminSupabase, {
        organizationId,
        userId: ownerUserId,
      });
      await assertBillingExecutionAccess(adminSupabase, {
        userId: ownerUserId,
        organizationId,
      });
    }
    return {
      adminSupabase,
      executionWorkflow,
      record,
      ownerUserId,
      runtimeLimits: ownerUserId
        ? await readWorkflowRuntimeLimitsDirect(adminSupabase, {
            organizationId,
            userId: ownerUserId,
          })
        : { maxConcurrentExecutionsPerUser: 2, maxExecutionSeconds: 300 },
      webhookRequest,
    };
  }

  private async loadPublishedWorkflowRecord(
    request: Request,
    response: Response,
    workflowId: string,
  ): Promise<{ adminSupabase: any; record: PersistedWorkflowRecord } | null> {
    const adminSupabase = SupabaseClientAdmin();
    const record = await loadPersistedWorkflowRecord(adminSupabase, workflowId);
    if (!record || !record.isActive) {
      response.status(404).json({
        error: 'Workflow not found.',
      });
      return null;
    }

    const providedSecret =
      typeof request.headers['x-workflow-secret'] === 'string'
        ? request.headers['x-workflow-secret']
        : Array.isArray(request.headers['x-workflow-secret'])
        ? request.headers['x-workflow-secret'][0]
        : '';

    if (!verifyWorkflowSecret(record, providedSecret)) {
      response.status(401).json({
        error: 'Invalid workflow secret.',
      });
      return null;
    }

    return {
      adminSupabase,
      record,
    };
  }

  private async handleRequest(request: Request, response: Response, workflowId: string, routeType: 'test' | 'published') {
    try {
      const resolved = await this.resolveWebhookInvocation(request, response, workflowId, routeType);
      if (!resolved) {
        return response;
      }

      if (routeType === 'test') {
        const editorSession = getWorkflowEditorSession(workflowId);
        const targetRoom = editorSession?.socketId || '';
        if (!targetRoom) {
          return response.status(409).json(createWebhookErrorPayload(routeType, 'No active workflow designer session is available.'));
        }

        const requestId = createRunId('step');
        const pending = createPendingWebhookTestRequest({
          requestId,
          workflowId,
          timeoutMs: 90_000,
        });

        Executor.publish(targetRoom, 'workflow:webhook:test:invoke', {
          request_id: requestId,
          workflow_id: workflowId,
          route_type: routeType,
          request: resolved.webhookRequest,
        });

        try {
          const result = await pending;
          return response.status(200).json({
            accepted: true,
            route_type: routeType,
            request_id: requestId,
            ...(typeof result === 'object' && result ? result : { result }),
          });
        } catch (error) {
          const testError = error as Error & { logs?: unknown; output?: unknown };
          return response.status(500).json({
            error: error instanceof Error ? error.message : 'Workflow editor test execution failed.',
            logs: testError.logs ?? [],
            output: testError.output ?? null,
          });
        }
      }

      const preparedWorkflow = applyWebhookRequestToWorkflow(resolved.executionWorkflow, resolved.webhookRequest);
      const result = await executeQueuedWebhookWorkflow({
        request,
        response,
        routeType,
        adminSupabase: resolved.adminSupabase,
        record: resolved.record,
        runtimeLimits: resolved.runtimeLimits,
        webhookRequest: resolved.webhookRequest,
        preparedWorkflow,
      });
      const ownerUserId = await resolveOwnerId(resolved.adminSupabase, resolved.record);
      if (ownerUserId) {
        await recordAIPolicyUsageDirect(resolved.adminSupabase, {
          eventType: 'workflow.webhook.sync',
          organizationId: resolved.record.organizationId || null,
          userId: ownerUserId,
        });
      }

      return response.status(200).json({
        accepted: true,
        route_type: routeType,
        run_id: result.runId,
        stopped: result.stopped,
        /** IF THE AI TEST FAILS ON IT THEN MODIFY THE AI TEST BUT DONT RETURN THE OBJECT */
        // workflow: result.workflow,
        output: result.output,
        logs: result.logs,
      });
    } catch (error) {
      if (routeType !== 'test') {
        throw error;
      }
      if (response.headersSent) {
        return response;
      }
      const testError = error as Error & { logs?: unknown; output?: unknown };
      return response.status(500).json({
        error: error instanceof Error ? error.message : 'Workflow webhook test failed.',
        logs: testError.logs ?? [],
        output: testError.output ?? null,
      });
    }
  }

  private async handleAsyncPublished(request: Request, response: Response, workflowId: string) {
    const resolved = await this.resolveWebhookInvocation(request, response, workflowId, 'published');
    if (!resolved) {
      return response;
    }

    const preparedWorkflow = applyWebhookRequestToWorkflow(resolved.executionWorkflow, resolved.webhookRequest);
    const result = await createQueuedWebhookWorkflowExecution({
      request,
      routeType: 'published',
      adminSupabase: resolved.adminSupabase,
      record: resolved.record,
      runtimeLimits: resolved.runtimeLimits,
      webhookRequest: resolved.webhookRequest,
      preparedWorkflow,
    });
    const ownerUserId = await resolveOwnerId(resolved.adminSupabase, resolved.record);
    if (ownerUserId) {
      await recordAIPolicyUsageDirect(resolved.adminSupabase, {
        eventType: 'workflow.webhook.async',
        organizationId: resolved.record.organizationId || null,
        userId: ownerUserId,
      });
    }

    return response.status(202).json({
      status: 'created',
      executionId: result.executionId,
      runId: result.runId,
    });
  }

  private async handlePublishedExecutionStatus(request: Request, response: Response, workflowId: string, executionId: string) {
    const resolved = await this.loadPublishedWorkflowRecord(request, response, workflowId);
    if (!resolved) {
      return response;
    }

    const status = await loadWorkflowWebhookExecutionStatus({
      supabase: resolved.adminSupabase,
      workflowId,
      executionId,
    });
    if (!status) {
      return response.status(404).json({
        error: 'Workflow execution not found.',
      });
    }

    return response.status(200).json(status);
  }

  @Get('/:workflowId/webhook/test')
  async getTest(@Param('workflowId') workflowId: string, @Req() request: Request, @Res() response: Response) {
    return this.handleRequest(request, response, workflowId, 'test');
  }

  @Post('/:workflowId/webhook/test')
  async postTest(@Param('workflowId') workflowId: string, @Req() request: Request, @Res() response: Response) {
    return this.handleRequest(request, response, workflowId, 'test');
  }

  @Get('/:workflowId/webhook/published')
  async getPublished(@Param('workflowId') workflowId: string, @Req() request: Request, @Res() response: Response) {
    return this.handleRequest(request, response, workflowId, 'published');
  }

  @Post('/:workflowId/webhook/published')
  async postPublished(@Param('workflowId') workflowId: string, @Req() request: Request, @Res() response: Response) {
    return this.handleRequest(request, response, workflowId, 'published');
  }

  @Get('/:workflowId/webhook/published/async')
  async getPublishedAsync(@Param('workflowId') workflowId: string, @Req() request: Request, @Res() response: Response) {
    return this.handleAsyncPublished(request, response, workflowId);
  }

  @Post('/:workflowId/webhook/published/async')
  async postPublishedAsync(@Param('workflowId') workflowId: string, @Req() request: Request, @Res() response: Response) {
    return this.handleAsyncPublished(request, response, workflowId);
  }

  @Get('/:workflowId/webhook/executions/:executionId')
  async getPublishedExecutionStatus(
    @Param('workflowId') workflowId: string,
    @Param('executionId') executionId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.handlePublishedExecutionStatus(request, response, workflowId, executionId);
  }
}
