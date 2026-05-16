import { getCustomResolvers, GraphQLOperationType, loadSchemaSDL, OperationType } from '@connectingmatrix/graphql-parser';
import { ApolloServer } from 'apollo-server-express';
import { Request, Response } from 'express';
import { buildSchema } from 'graphql';
import { Body, Get, JsonController, Post, Req, Res } from 'routing-controllers';
import { Service } from 'typedi';
import { GraphqlOperationContext } from '@giga/shared/types';
import { readGraphqlCacheConfig, readGraphqlCacheKey, readGraphqlOperationName, runGraphqlCache } from '@giga/shared/cache';
import { EXTENDED_SCHEMA, SUPABASE_SCHEMA } from '@giga/shared/lib/constant';
import { EnvLoader } from '@giga/shared/lib/env';
import { isDashedAccessToken } from '@giga/shared/lib/helper';
import { createEntityResolvers, mergeResolverMaps, type ResolverMap } from '@connectingmatrix/orm/services/graphql/entity-graphql';
import { entityBackedGraphqlResolvers } from '@connectingmatrix/orm/services/graphql/entity';
import { mergeEntityFieldResolvers } from '@connectingmatrix/orm/services/graphql/entity/contracts/entity-field-resolvers';
import { ensureEntityOrmInstalled, withEntityRequestContext } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import { runResolverAccessMiddleware } from '@giga/permissions/manifest/manifest';
import { readAppAccessToken } from '@giga/permissions/services/auth/app-auth-token';
import { markLifecycle } from '@connectingmatrix/logger/lifecycle-jsonl';
import { GraphqlMiddleware } from '@giga/general/middleware/graphql.middleware';
import { FactoryService } from '@giga/general/services/graphql/factory.service';
import '@giga/general/services/graphql/resolvers';
import { SupabaseClient } from '@giga/general/decorators/integration/supabase-client';
import type { GraphqlProxyBody, GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

type ResolverFn = (root: unknown, payload: unknown, context: GraphqlResolverContext, info: unknown) => unknown;

type RequestWithContext = Request & {
  context?: GraphqlOperationContext | null;
  effectiveRoot?: boolean;
  graphqlContext?: GraphqlOperationContext | null;
  lifecycleState?: { requestId: string; startedAtMs: number; lastAtMs: number };
  requestId?: string | null;
  supabase?: unknown;
  userId?: string | null;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const afterOperation = (payload: any): any => {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    return payload;
  }

  return {
    ...payload,
    data: payload.data,
  };
};

@JsonController('/graphql')
@Service()
export class GraphqlController {
  private readonly apolloServer: ApolloServer;

  private readonly localResolvers: ResolverMap;

  private readonly apolloMiddleware: (request: Request, response: Response, next: (error?: unknown) => void) => void;

  private wrapResolvers(input: Record<string, ResolverFn>, options: { accessMiddleware: boolean }): Record<string, ResolverFn> {
    return Object.entries(input).reduce<Record<string, ResolverFn>>((acc, [resolverName, handler]) => {
      acc[resolverName] = async (root: unknown, payload: unknown, context: GraphqlResolverContext, info: unknown) => {
        const request = context?.request as RequestWithContext | undefined;
        const lifecycleState = request?.lifecycleState;
        if (lifecycleState) {
          markLifecycle(lifecycleState, { layer: 'graphql.resolver', event: resolverName, phase: 'start', transport: 'graphql' });
        }
        return withEntityRequestContext(context, payload, async () => {
          if (options.accessMiddleware) await runResolverAccessMiddleware(resolverName, context, payload);
          try {
            const result = await handler(root, payload, context, info);
            if (lifecycleState) {
              markLifecycle(lifecycleState, { layer: 'graphql.resolver', event: resolverName, phase: 'end', transport: 'graphql', status: 'passed' });
            }
            return result;
          } catch (error) {
            if (lifecycleState) {
              markLifecycle(lifecycleState, {
                layer: 'graphql.resolver',
                event: resolverName,
                phase: 'error',
                transport: 'graphql',
                status: 'failed',
              });
            }
            throw error;
          }
        });
      };
      return acc;
    }, {});
  }

  private wrapResolverMap(map: ResolverMap, customNames: { Mutation: Set<string>; Query: Set<string> }): ResolverMap {
    const output: ResolverMap = { Query: {}, Mutation: {} };
    for (const [typeName, resolvers] of Object.entries(map)) {
      output[typeName] = {};
      for (const [fieldName, resolver] of Object.entries(resolvers || {})) {
        const isRoot = typeName === 'Query' || typeName === 'Mutation';
        const isCustom = isRoot && customNames[typeName]?.has(fieldName);
        output[typeName][fieldName] = this.wrapResolvers({ [fieldName]: resolver as ResolverFn }, { accessMiddleware: Boolean(isCustom) })[fieldName];
      }
    }
    return output;
  }

  private filterResolversBySchema(sdl: string, map: ResolverMap): ResolverMap {
    const schema = buildSchema(sdl);
    const filtered: ResolverMap = { Query: {}, Mutation: {} };
    const fieldsByType = new Map<string, Set<string>>();
    for (const [typeName, graphType] of Object.entries(schema.getTypeMap())) {
      if (typeName.startsWith('__') || !('getFields' in graphType)) continue;
      fieldsByType.set(typeName, new Set(Object.keys(graphType.getFields())));
    }
    for (const [typeName, resolvers] of Object.entries(map)) {
      const knownFields = fieldsByType.get(typeName);
      if (!knownFields) continue;
      for (const [fieldName, resolver] of Object.entries(resolvers || {})) {
        if (!knownFields.has(fieldName)) continue;
        if (!filtered[typeName]) filtered[typeName] = {};
        filtered[typeName][fieldName] = resolver;
      }
    }
    return filtered;
  }

  constructor(private factoryService: FactoryService, private graphqlMiddleware: GraphqlMiddleware) {
    void ensureEntityOrmInstalled();
    const { sdl } = loadSchemaSDL(SUPABASE_SCHEMA, EXTENDED_SCHEMA);
    const queryResolvers = getCustomResolvers(this.factoryService, GraphQLOperationType.QUERY) as Record<string, ResolverFn>;
    const mutationResolvers = getCustomResolvers(this.factoryService, GraphQLOperationType.MUTATION) as Record<string, ResolverFn>;
    const entityResolvers = createEntityResolvers();
    const mergedResolvers = mergeResolverMaps(
      entityResolvers,
      entityBackedGraphqlResolvers as Partial<ResolverMap>,
      {
        Query: queryResolvers,
        Mutation: mutationResolvers,
      } as Partial<ResolverMap>,
    );
    const wrappedResolvers = this.wrapResolverMap(mergedResolvers, {
      Query: new Set(Object.keys(queryResolvers)),
      Mutation: new Set(Object.keys(mutationResolvers)),
    });
    this.localResolvers = this.filterResolversBySchema(sdl, wrappedResolvers);
    const apolloResolvers = this.filterResolversBySchema(sdl, mergeEntityFieldResolvers(this.localResolvers as any) as ResolverMap);
    this.apolloServer = new ApolloServer({
      typeDefs: sdl,
      resolvers: apolloResolvers as any,
      ...({ resolverValidationOptions: { requireResolversForResolveType: false, requireResolversToMatchSchema: 'ignore' } } as Record<
        string,
        unknown
      >),
      context: async ({ req }: { req: RequestWithContext }) => {
        const supabase = req.supabase || (await SupabaseClient(req));
        return {
          request: req,
          supabase,
          body: (req.body || {}) as GraphqlProxyBody,
          graphqlContext: req.graphqlContext || req.context || null,
          userId: req.userId || req.graphqlContext?.userId || null,
          effectiveRoot: req.effectiveRoot === true || req.graphqlContext?.effectiveRoot === true,
        };
      },
      formatResponse: (payload: unknown, requestContext: unknown) => {
        const context = record(record(requestContext).context) as GraphqlResolverContext;
        return afterOperation(payload);
      },
    });

    this.apolloMiddleware = this.apolloServer.getMiddleware({ path: '/' }) as unknown as (
      request: Request,
      response: Response,
      next: (error?: unknown) => void,
    ) => void;
  }

  private isLocallyHandled(operationContext: GraphqlOperationContext | null): boolean {
    const operation = operationContext?.operation;
    if (!operation) return false;
    const store = operation?.type === OperationType.MUTATION ? this.localResolvers.Mutation : this.localResolvers.Query;
    return Boolean(
      operation.fields.length && operation.fields.every((field) => field.operation === operation.type && typeof store[field.name] === 'function'),
    );
  }

  private async routeToSupabase(
    operationContext: GraphqlOperationContext | null,
    body: GraphqlProxyBody,
  ): Promise<{ status: number; payload: unknown }> {
    const supabaseUrl = EnvLoader.getOrThrow('SUPABASE_URL').replace(/\/+$/g, '');
    const graphqlUrl = `${supabaseUrl}/graphql/v1`;
    const apiKey = EnvLoader.getOrThrow('SUPABASE_ANON_KEY');
    const accessToken = operationContext?.accessToken || null;
    const appUser = readAppAccessToken(accessToken, true);
    const upstreamAccessToken = appUser?.supabaseAccessToken || (!appUser && !isDashedAccessToken(accessToken) ? accessToken : null);
    const hasUserToken = Boolean(operationContext?.hasUserToken && upstreamAccessToken);
    const requestId = String((operationContext as { requestId?: string } | null)?.requestId || '').trim() || null;
    const upstreamResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey,
        Authorization: `Bearer ${hasUserToken ? upstreamAccessToken : apiKey}`,
        'X-Request-Id': requestId || '',
      },
      body: JSON.stringify({ query: body.query, variables: body.variables || null, operationName: body.operationName || null }),
    });
    const rawBody = await upstreamResponse.text();
    let payload: unknown = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch (_error) {
      payload = { error: { message: 'Invalid response from Supabase GraphQL endpoint.', raw: rawBody } };
    }
    return { status: upstreamResponse.status, payload };
  }

  private routeToApollo(request: Request, response: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        response.removeListener('finish', onFinish);
        response.removeListener('close', onClose);
      };
      const done = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };
      const onFinish = () => done();
      const onClose = () => done();
      response.once('finish', onFinish);
      response.once('close', onClose);
      try {
        this.apolloMiddleware(request, response, (error?: unknown) => done(error));
      } catch (error) {
        done(error);
      }
    });
  }

  @Get('/')
  @Post('/')
  async proxy(@Req() request: RequestWithContext, @Res() response: Response, @Body() body: GraphqlProxyBody = {}) {
    const { lifecycleState } = request;
    if (lifecycleState) markLifecycle(lifecycleState, { layer: 'graphql.controller', event: 'graphql.proxy', phase: 'start', transport: 'graphql' });
    if (request.method.toUpperCase() === 'GET') {
      await this.routeToApollo(request, response);
      if (lifecycleState)
        markLifecycle(lifecycleState, {
          layer: 'graphql.controller',
          event: 'graphql.proxy',
          phase: 'end',
          transport: 'graphql',
          status: 'passed',
          meta: { route: 'apollo-get' },
        });
      return response;
    }

    const operationContext = request.context || (await this.graphqlMiddleware.beforeOperation(request, body));
    (operationContext as { requestId?: string | null }).requestId = request.requestId || null;
    request.context = operationContext;
    request.graphqlContext = operationContext;

    if (this.isLocallyHandled(operationContext)) {
      await this.routeToApollo(request, response);
      if (lifecycleState)
        markLifecycle(lifecycleState, {
          layer: 'graphql.controller',
          event: 'graphql.proxy',
          phase: 'end',
          transport: 'graphql',
          status: 'passed',
          meta: { route: 'apollo-entity' },
        });
      return response;
    }

    const operationName = body.operationName || readGraphqlOperationName(body.query || '');
    const cacheConfig = operationContext?.operation?.type === OperationType.QUERY && operationName ? readGraphqlCacheConfig(operationName) : null;
    const upstream = cacheConfig
      ? await runGraphqlCache({
          key: readGraphqlCacheKey({
            effectiveRoot: operationContext?.effectiveRoot === true,
            operationName,
            userId: operationContext?.userId || null,
            variables: (body.variables || {}) as Record<string, unknown>,
          }),
          read: () => this.routeToSupabase(operationContext, body),
          shouldStore: (value) => value.status >= 200 && value.status < 300,
          tags: cacheConfig.readTags((body.variables || {}) as Record<string, unknown>),
          ttlMs: cacheConfig.ttlMs,
        })
      : await this.routeToSupabase(operationContext, body);
    const { status, payload } = upstream;
    const result = response.status(status).send(this.graphqlMiddleware.afterOperation(payload));
    if (lifecycleState)
      markLifecycle(lifecycleState, {
        layer: 'graphql.controller',
        event: 'graphql.proxy',
        phase: 'end',
        transport: 'graphql',
        status: status < 400 ? 'passed' : 'failed',
        meta: { route: 'supabase', code: status },
      });
    return result;
  }
}
