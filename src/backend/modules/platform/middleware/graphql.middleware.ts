import { Middleware, UnauthorizedError } from 'routing-controllers';
import { Service } from 'typedi';
import { OperationType, parseJSON } from '@connectingmatrix/graphql-parser';
import { GraphqlOperationContext } from '@giga/shared/types';
import { readGraphqlOperationName } from '@giga/shared/cache';
import { getCurrentUserIdOrThrow, isCurrentUserRootUser, tokenExtractor } from '@giga/shared/lib/helper';
import { markLifecycle } from '@connectingmatrix/logger/lifecycle-jsonl';
import { SupabaseClient } from '@giga/general/decorators/integration/supabase-client';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import type { GraphqlProxyBody } from '@giga/shared/types/contracts/graphql.types';

const PUBLIC_GRAPHQL_OPERATIONS = new Set([
  'authsignup',
  'authsignuporganisation',
  'authlogin',
  'authforgotpassword',
  'authverifyemail',
  'authresendverification',
  'authsendemailotp',
  'authverifyotp',
  'authping',
  'chatsharebytoken',
  'introspectionquery',
]);

function isPublicGraphqlOperation(name: string): boolean {
  return PUBLIC_GRAPHQL_OPERATIONS.has(name.toLowerCase());
}

function isPublicGraphqlRequest(fields: { name: string }[]): boolean {
  return Boolean(fields.length && fields.every((field) => isPublicGraphqlOperation(field.name)));
}

@Service()
@Middleware({ type: 'before' })
export class GraphqlMiddleware {
  async beforeOperation(request: any, body: GraphqlProxyBody): Promise<GraphqlOperationContext | null> {
    const lifecycleState = request?.lifecycleState;
    if (lifecycleState) {
      markLifecycle(lifecycleState, { layer: 'middleware.graphql', event: 'before_operation', phase: 'start', transport: 'graphql' });
    }
    try {
      const json = parseJSON(body as any);
      const { access_token } = tokenExtractor(request);
      const accessToken = access_token && access_token !== 'undefined' ? access_token : null;

      if (!json) {
        const operationName = readGraphqlOperationName(body.query || '');
        const isPublicOperation = Boolean(operationName && isPublicGraphqlOperation(operationName));

        if (!isPublicOperation && !accessToken) {
          throw new UnauthorizedError('Authorization token is required.');
        }

        return {
          operation: {
            type: String(body.query || '')
              .toLowerCase()
              .includes('mutation')
              ? OperationType.MUTATION
              : OperationType.QUERY,
            name: operationName,
            variable: {},
            fields: [],
          },
          isPublicOperation,
          hasUserToken: Boolean(accessToken),
          accessToken,
          userId: null,
          effectiveRoot: false,
        };
      }

      const { operation } = json;
      const isPublicOperation = isPublicGraphqlRequest(operation.fields);

      const context: GraphqlOperationContext = {
        operation,
        isPublicOperation,
        hasUserToken: Boolean(accessToken),
        accessToken,
        userId: null,
        effectiveRoot: false,
      };

      if (!isPublicOperation && !accessToken) {
        throw new UnauthorizedError('Authorization token is required.');
      }

      if (!isPublicOperation) {
        const supabase = (request as any).supabase || (await SupabaseClient(request));
        let userId: string;
        let effectiveRoot = false;

        try {
          userId = await getCurrentUserIdOrThrow(supabase);
          effectiveRoot = await isCurrentUserRootUser(supabase);
        } catch (error) {
          throw new UnauthorizedError((error as Error)?.message || 'Authorization token is invalid.');
        }

        (request as any).supabase = supabase;
        (request as any).userId = userId;
        (request as any).effectiveRoot = effectiveRoot;
        (supabase as any).__auth_user_id = userId;
        context.userId = userId;
        context.effectiveRoot = effectiveRoot;
      }
      if (lifecycleState) {
        markLifecycle(lifecycleState, {
          layer: 'middleware.graphql',
          event: 'before_operation',
          phase: 'end',
          transport: 'graphql',
          status: 'passed',
          meta: { is_public: isPublicOperation },
        });
      }

      return context;
    } catch (error) {
      if (lifecycleState) {
        markLifecycle(lifecycleState, {
          layer: 'middleware.graphql',
          event: 'before_operation',
          phase: 'error',
          transport: 'graphql',
          status: 'failed',
        });
      }
      throw error;
    }
  }

  afterOperation(payload: any): any {
    if (!payload || typeof payload !== 'object' || !payload.data) {
      return payload;
    }

    return {
      ...payload,
      data: payload.data,
    };
  }

  async use(req: any, res: any, next: (err?: any) => any): Promise<any> {
    const path = String(req?.path || req?.originalUrl || '');
    if (!path.includes('/graphql')) return next();
    req.context = await this.beforeOperation(req, req.body);
    return next();
  }
}
