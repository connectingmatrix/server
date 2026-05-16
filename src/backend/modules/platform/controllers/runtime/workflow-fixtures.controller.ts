import { Request, Response } from 'express';
import { Get, JsonController, Post, Req, Res } from 'routing-controllers';
import { Service } from 'typedi';
import { getCurrentUserIdOrThrow } from '@giga/shared/lib/helper';
import { importLatestChatParityAiAgentWorkflow } from '@connectingmatrix/chat/services/chat/workflow/io/import-chat-parity-workflow';
import { readChatParityFixture } from '@connectingmatrix/chat/services/chat/workflow/runtime/chat-parity-fixtures';
import { SupabaseClient } from '@giga/general/decorators/integration/supabase-client';

@JsonController('/workflow-fixtures')
@Service()
export class WorkflowFixturesController {
  @Get('/chat-parity/ai-agent/latest-workflow.json')
  downloadLatestAiAgentWorkflow(@Res() response: Response) {
    const fixture = readChatParityFixture('ai-agent');
    const payload = JSON.stringify(fixture.workflow, null, 2);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="chat-parity-ai-agent-workflow.latest.json"');
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).send(payload);
  }

  @Post('/chat-parity/ai-agent/import-latest')
  async importLatestAiAgentWorkflow(@Req() request: Request, @Res() response: Response) {
    const supabase = await SupabaseClient(request);
    const userId = await getCurrentUserIdOrThrow(supabase);
    const workflow = await importLatestChatParityAiAgentWorkflow(userId);
    return response.status(200).json(workflow);
  }
}
