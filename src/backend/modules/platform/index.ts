import 'reflect-metadata';
import { createServer } from 'http';
import express from 'express';
import { useContainer, useExpressServer, getMetadataArgsStorage } from 'routing-controllers';
import { Container } from 'typedi';
import cors from 'cors';
import serverlessExpress from '@vendia/serverless-express';
import { ApolloServer, gql } from 'apollo-server-express';
import { getCustomResolvers, GraphQLOperationType, loadSchemaSDL } from '@connectingmatrix/graphql-parser';
import { Executor } from '@workflow/executor';
import { setupChatSocketServer } from '@connectingmatrix/sockets/chat/runtime/chat.socket';
import { EXTENDED_SCHEMA, SUPABASE_SCHEMA } from '@giga/shared/lib/constant';
import { setupRuntimeSocketServer } from '@giga/process-monitoring/socket/runtime/runtime.socket';
import { SUPABASE_ADMIN_CLIENT_TOKEN } from '@giga/general/decorators/runtime/supabase.decorator';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { GraphqlMiddleware } from '@giga/general/middleware';
import { GlobalErrorHandler } from './middleware/global-error-handler.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import '@connectingmatrix/workflows/services/workflow/runtime/setupWorkflowExecutor';
import { registerShutdown } from './shutdown';
import { AgentAppLiveController, GraphqlController, McpController, WorkflowFixturesController, WorkflowWebhookController } from './controllers';

const APOLLO_STUDIO_ORIGIN = 'https://studio.apollographql.com';
let runtimeErrorHandlersRegistered = false;

const registerRuntimeErrorHandlers = () => {
  if (runtimeErrorHandlersRegistered) return;
  runtimeErrorHandlersRegistered = true;
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('Unhandled promise rejection in backend runtime.', reason);
  });
  process.on('uncaughtException', (error) => {
    // eslint-disable-next-line no-console
    console.error('Uncaught exception in backend runtime.', error);
  });
};

export const Server = {
  connect: async () => {},

  start: () => {
    registerRuntimeErrorHandlers();
    useContainer(Container);
    // Register SupabaseAdminClient instance in TypeDI container (admin client doesn't need per-request tokens)
    const adminSupabaseClient = SupabaseClientAdmin();
    Container.set(SUPABASE_ADMIN_CLIENT_TOKEN, adminSupabaseClient);

    // Note: Regular SupabaseClient is now injected per-request via @InjectSupabase() decorator
    // No need to register it as a singleton

    const app = express();

    app.use(express.json({ limit: '100mb' }));

    app.use(
      express.urlencoded({
        extended: true,
        limit: '100mb',
        parameterLimit: 50000,
      }),
    );

    app.use(
      cors({
        origin: '*',
        credentials: true,
      }),
    );
    app.use(requestIdMiddleware);

    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
      });
    });

    // Configure controllers
    useExpressServer(app, {
      routePrefix: '/api/v2',
      controllers: [GraphqlController, McpController, AgentAppLiveController, WorkflowFixturesController, WorkflowWebhookController],
      middlewares: [GraphqlMiddleware, GlobalErrorHandler],
      defaultErrorHandler: false,
      classTransformer: true,
      validation: true,
    });

    // Get port from environment or use default
    const port = process.env.PORT || 4000;
    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

    const server = createServer(app);
    setupChatSocketServer(server);
    setupRuntimeSocketServer(server);
    registerShutdown(server);
    if (process.env.GIGA_DISABLE_API_WORKFLOW_QUEUE !== '1') {
      void Executor.start().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to start workflow queue services.', error);
      });
    }

    server.listen(process.env.PORT || 4000, () => {
      // eslint-disable-next-line no-console
      console.log(`⚡️[server]: Server is running at http://localhost:${process.env.PORT || 4000}`);
      // eslint-disable-next-line no-console
      console.log(`⚡️[socket]: Chat socket.io endpoint is running at http://localhost:${process.env.PORT || 4000} with path /ws/chat`);
      // eslint-disable-next-line no-console
      console.log(`⚡️[socket]: Runtime monitor socket.io endpoint is running at http://localhost:${process.env.PORT || 4000} with path /ws/runtime`);
      // eslint-disable-next-line no-console
      console.log(`⚡️[executor]: Workflow transport endpoint is running at http://localhost:${process.env.PORT || 4000} with path /ws/workflow`);
    });

    server.setTimeout(0);

    return app;
  },
};

export const handler = Server.start();
