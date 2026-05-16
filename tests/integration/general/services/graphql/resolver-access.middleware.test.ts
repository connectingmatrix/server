/**
 * Regression coverage for the manifest-driven resolver preflight.
 * These tests prove that permissions, plan-policy limits, and root bypass are enforced
 * before GraphQL resolver business logic is allowed to run.
 * It feeds confidence in the manifest access layer as the single enforcement entry point.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestError } from 'routing-controllers';
import { runResolverAccessMiddleware } from '@giga/permissions/manifest/manifest';
import { DEFAULT_MATRIX } from '@giga/plan-policy/manifest/default-matrix';
import { installOrmForStub } from '@giga/shared/test/supabase-stub';
import { RESOLVER_ACCESS_CONFIG } from '@giga/general/services/graphql/resolver-access.config';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

type Tables = Record<string, Array<Record<string, any>>>;

class Query {
  private filters: Array<{ key: string; op: string; value: any }> = [];

  private wantsCount = false;

  private wantsHead = false;

  private limitValue: number | null = null;

  private offsetValue = 0;

  public constructor(private readonly tables: Tables, private readonly table: string) {}

  public eq(key: string, value: any) {
    this.filters.push({ key, op: 'eq', value });
    return this;
  }

  public gte(key: string, value: any) {
    this.filters.push({ key, op: 'gte', value });
    return this;
  }

  public is(key: string, value: any) {
    this.filters.push({ key, op: 'eq', value });
    return this;
  }

  public in(key: string, value: any[]) {
    this.filters.push({ key, op: 'in', value });
    return this;
  }

  public ilike(key: string, value: string) {
    this.filters.push({ key, op: 'ilike', value });
    return this;
  }

  public neq(key: string, value: any) {
    this.filters.push({ key, op: 'neq', value });
    return this;
  }

  public order() {
    return this;
  }

  public lte(key: string, value: any) {
    this.filters.push({ key, op: 'lte', value });
    return this;
  }

  public limit(count: number) {
    this.limitValue = Math.max(0, Number(count) || 0);
    return this;
  }

  public range(from: number, to: number) {
    this.offsetValue = Math.max(0, Number(from) || 0);
    this.limitValue = Math.max(0, (Number(to) || 0) - this.offsetValue + 1);
    return this;
  }

  public maybeSingle() {
    const rows = this.rows();
    return Promise.resolve({ data: rows[0] || null, error: null });
  }

  public select(_value?: string, options?: { count?: string; head?: boolean }) {
    this.wantsCount = options?.count === 'exact';
    this.wantsHead = options?.head === true;
    return this;
  }

  public then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }

  private match(row: Record<string, any>) {
    return this.filters.every((filter) => {
      if (filter.op === 'eq') return row[filter.key] === filter.value;
      if (filter.op === 'neq') return row[filter.key] !== filter.value;
      if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(row[filter.key]);
      if (filter.op === 'ilike')
        return String(row[filter.key] || '')
          .toLowerCase()
          .includes(
            String(filter.value || '')
              .replace(/%/g, '')
              .toLowerCase(),
          );
      if (filter.op === 'gte') return String(row[filter.key] || '') >= String(filter.value || '');
      if (filter.op === 'lte') return String(row[filter.key] || '') <= String(filter.value || '');
      return true;
    });
  }

  private result() {
    const rows = this.rows();
    const sliced = rows.slice(this.offsetValue, this.limitValue === null ? undefined : this.offsetValue + this.limitValue);
    return {
      count: this.wantsCount ? rows.length : null,
      data: this.wantsHead ? null : sliced.map((row) => ({ ...row })),
      error: null,
    };
  }

  private rows() {
    return (this.tables[this.table] || []).filter((row) => this.match(row));
  }
}

function createContext(tables: Tables, effectiveRoot = false, userId = 'user-1'): GraphqlResolverContext {
  const supabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: userId,
          },
        },
        error: null,
      }),
    },
    from(table: string) {
      return new Query(tables, table) as any;
    },
  } as any;
  installOrmForStub(supabase);
  return {
    request: {} as any,
    supabase,
    body: {},
    effectiveRoot,
    userId,
  };
}

function createTables(limit: number, used = 0, workflowAiAllowed = true, userId = 'user-1'): Tables {
  const workflowPermission = {
    create: workflowAiAllowed,
    delete: workflowAiAllowed,
    execute: workflowAiAllowed,
    read: workflowAiAllowed,
    update: workflowAiAllowed,
  };

  return {
    User: [
      {
        id: userId,
        email: 'user@example.com',
        stripeCustomerId: 'cus_1',
      },
    ],
    Subscription: [
      {
        id: `subscription-${userId}`,
        subscribedBy: userId,
        createdAt: '2026-03-01T00:00:00.000Z',
        expiresAt: '2026-04-01T00:00:00.000Z',
        nextBillingDate: '2026-04-01T00:00:00.000Z',
        paymentSource: 'STRIPE:user:starter-pack:paid',
        startDate: '2026-03-01T00:00:00.000Z',
        status: 'active',
      },
    ],
    organization_members: [],
    ai_permissions: [],
    ai_plan_policies: [
      {
        id: 'policy-1',
        limitations: {
          MAX_WORKFLOW_AI_CREDITS_PER_BILLING_PERIOD: limit,
        },
        mode: 'PAID',
        node_restrictions: [],
        permissions: {
          WORKFLOW: workflowPermission,
          WORKFLOW_AI_PERMISSIONS: workflowPermission,
        },
        plan_id: 'starter-pack',
        scope: 'USER',
        trial_days: null,
        updated_at: '2026-03-01T00:00:00.000Z',
      },
    ],
    ai_usage_events: Array.from({ length: used }).map((_, index) => ({
      id: `event-${index}`,
      created_at: '2026-03-15T00:00:00.000Z',
      user_id: userId,
      organization_id: null,
    })),
  };
}

test('resolver middleware blocks manifest-driven plan permission before resolver execution', async () => {
  const context = createContext(createTables(10, 0, false, 'user-permission-denied'), false, 'user-permission-denied');
  await assert.rejects(
    runResolverAccessMiddleware('agentExecute', context, {
      input: {
        message: 'Hello',
      },
    }),
    (error: any) => error instanceof BadRequestError && error.message === 'Plan access does not allow workflow_ai_permissions create.',
  );
});

test('resolver middleware allows manifest-driven root bypass', async () => {
  const context = createContext(createTables(10, 0, false), true);
  await assert.doesNotReject(
    runResolverAccessMiddleware('agentExecute', context, {
      input: {
        message: 'Hello',
      },
    }),
  );
});

test('resolver middleware blocks AI credit overages from manifest limits', async () => {
  const context = createContext(createTables(1, 1, true, 'user-credit-overage'), false, 'user-credit-overage');
  await assert.rejects(
    runResolverAccessMiddleware('agentExecute', context, {
      input: {
        message: 'Hello',
      },
    }),
    (error: any) => error instanceof BadRequestError && error.message === 'AI credit limit reached for the current billing period.',
  );
});

test('workflow collection resolvers stay keyed by the public underscore names', () => {
  assert.ok(DEFAULT_MATRIX.aiWorkflowsCollection);
  assert.ok(DEFAULT_MATRIX.workflowExecutionOptions);
  assert.ok(DEFAULT_MATRIX.insertIntoai_workflowsCollection);
  assert.ok(DEFAULT_MATRIX.updateai_workflowsCollection);
});
