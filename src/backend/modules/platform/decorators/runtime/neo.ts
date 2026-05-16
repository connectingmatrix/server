import { Neogma } from 'neogma';
import { NEO4JConfig } from '@giga/shared/lib/env/environment';
import { EnvLoader } from '@giga/shared/lib/env/index';
import { logger } from '@connectingmatrix/logger/lifecycle-jsonl';
import { shouldResetNeo4jConnection } from './neo-errors';

const transientConflictMessage = 'Cannot resolve conflicting transactions';
const transientAttempts = () => Number(EnvLoader.get('NEO4J_TRANSIENT_RETRY_ATTEMPTS') || 5);
const transientDelayMs = () => Number(EnvLoader.get('NEO4J_TRANSIENT_RETRY_DELAY_MS') || 250);
const transientStorageLockMessage = 'Cannot get unique access to the storage';
const graphWritePattern = /\b(CREATE|DELETE|DETACH|FOREACH|MERGE|REMOVE|SET)\b/i;
const configuredWriteLimit = Number(EnvLoader.get('NEO4J_MAX_CONCURRENT_WRITES') || 16);
const graphWriteGateLimit = Number.isFinite(configuredWriteLimit) && configuredWriteLimit > 0 ? configuredWriteLimit : 16;
const isTransientNeo4jError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes(transientConflictMessage) || message.includes(transientStorageLockMessage);
};
const isExistingIndexError = (error: unknown) =>
  /already exists|An equivalent index already exists|There already exists/i.test(error instanceof Error ? error.message : String(error || ''));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
class AsyncGate {
  private active = 0;

  private readonly waiting: Array<(release: () => void) => void> = [];

  constructor(private readonly limit: number) {}

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) {
        next(this.releaseOnce());
        return;
      }
      this.active = Math.max(this.active - 1, 0);
    };
  }

  async enter(): Promise<() => void> {
    if (this.active >= this.limit) return new Promise<() => void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    return this.releaseOnce();
  }
}
const graphIndexStatements = [
  'CREATE INDEX channel_id IF NOT EXISTS FOR (n:Channel) ON (n.id)',
  'CREATE INDEX channel_slug IF NOT EXISTS FOR (n:Channel) ON (n.slug)',
  'CREATE INDEX category_id IF NOT EXISTS FOR (n:Category) ON (n.id)',
  'CREATE INDEX category_slug IF NOT EXISTS FOR (n:Category) ON (n.slug)',
  'CREATE INDEX subject_ref_id IF NOT EXISTS FOR (n:SubjectRef) ON (n.id)',
  'CREATE INDEX subject_ref_slug IF NOT EXISTS FOR (n:SubjectRef) ON (n.slug)',
  'CREATE INDEX user_permissions_id IF NOT EXISTS FOR (n:UserPermissions) ON (n.id)',
  'CREATE INDEX organisation_id IF NOT EXISTS FOR (n:Organisation) ON (n.id)',
];

export class Neo4JConnection {
  private static instance: Neo4JConnection | null = null;

  private static readonly writeGate = new AsyncGate(graphWriteGateLimit);

  public readonly driver: Neogma;

  private indexesReady = false;

  private constructor() {
    const url = EnvLoader.getOrThrow(NEO4JConfig.NEO4J_URI);
    const username = EnvLoader.get(NEO4JConfig.NEO4J_USERNAME);
    const password = EnvLoader.get(NEO4JConfig.NEO4J_PASSWORD);
    const configuredPoolSize = Number(EnvLoader.get('NEO4J_MAX_CONNECTION_POOL_SIZE') || 240);

    if (!url) {
      throw new Error('Missing NEO4J_URI or MEMGRAPH_URI environment variable');
    }

    this.driver = new Neogma(
      {
        url,
        username,
        password,
      },
      {
        maxConnectionPoolSize: Number.isFinite(configuredPoolSize) && configuredPoolSize > 0 ? configuredPoolSize : 240,
      },
    );
  }

  public static async getInstance(): Promise<Neo4JConnection> {
    if (!Neo4JConnection.instance) {
      const connection = new Neo4JConnection();
      try {
        await connection.driver.verifyConnectivity();
        Neo4JConnection.instance = connection;
      } catch (error) {
        await connection.close();
        throw error;
      }
    }

    return Neo4JConnection.instance;
  }

  private static resetActiveInstance(connection: Neo4JConnection) {
    if (Neo4JConnection.instance !== connection) return;
    Neo4JConnection.instance = null;
    void connection.close();
  }

  private async close(): Promise<void> {
    try {
      await this.driver.driver.close();
    } catch {
      // Closing is best-effort; the next request creates a fresh driver.
    }
  }

  public async ensureIndexes(): Promise<void> {
    if (this.indexesReady) return;
    for (const statement of graphIndexStatements) {
      try {
        await this.driver.queryRunner.run(statement, {});
      } catch (error) {
        if (!isExistingIndexError(error)) throw error;
      }
    }
    this.indexesReady = true;
  }

  public async run<T = Record<string, unknown>>(statement: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const startedAt = Date.now();
    const requestId = String(params.request_id || params.__request_id || '').trim() || null;
    let lastError: unknown = null;
    const release = graphWritePattern.test(statement) ? await Neo4JConnection.writeGate.enter() : null;
    try {
      for (let attempt = 1; attempt <= transientAttempts(); attempt += 1) {
        try {
          const result = await this.driver.queryRunner.run(statement, params);
          // prettier-ignore
          logger.info({ layer: 'neo4j', event: 'neo4j.query', phase: 'end', transport: 'graphql', request_id: requestId, status: 'passed', duration_ms: Date.now() - startedAt, since_prev_ms: 0, meta: { rows: result.records.length, attempt }, });
          return result.records.map((record) => record.toObject() as T);
        } catch (error) {
          lastError = error;
          if (shouldResetNeo4jConnection(error)) {
            Neo4JConnection.resetActiveInstance(this);
            break;
          }
          if (!isTransientNeo4jError(error) || attempt >= transientAttempts()) break;
          // prettier-ignore
          logger.warn({ layer: 'neo4j', event: 'neo4j.query.retry', phase: 'retry', transport: 'graphql', request_id: requestId, status: 'retrying', duration_ms: Date.now() - startedAt, since_prev_ms: 0, meta: { attempt }, });
          await wait(attempt * transientDelayMs());
        }
      }
    } finally {
      release?.();
    }
    // prettier-ignore
    logger.error({ layer: 'neo4j', event: 'neo4j.query', phase: 'error', transport: 'graphql', request_id: requestId, status: 'failed', duration_ms: Date.now() - startedAt, since_prev_ms: 0, meta: {}, });
    const enrichedError = new Error(lastError instanceof Error ? lastError.message : 'Neo4j query failed') as Error & {
      cause?: unknown;
      params?: Record<string, unknown>;
      query?: string;
      variables?: Record<string, unknown>;
    };
    enrichedError.name = 'Neo4jQueryError';
    enrichedError.cause = lastError;
    enrichedError.query = statement;
    enrichedError.variables = params;
    enrichedError.params = params;
    throw enrichedError;
  }

  public async transaction<T>(
    callback: (runner: <TResult = Record<string, unknown>>(statement: string, params?: Record<string, unknown>) => Promise<TResult[]>) => Promise<T>,
  ): Promise<T> {
    return callback(<TResult = Record<string, unknown>>(statement: string, params: Record<string, unknown> = {}) =>
      this.run<TResult>(statement, params),
    );
  }
}
