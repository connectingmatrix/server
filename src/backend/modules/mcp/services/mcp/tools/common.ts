import { toSafeString } from 'giga-ai-helper';
import { BadRequestError } from 'routing-controllers';
import { objectSchema, type McpTool } from '../protocol';
import type { GigaMcpContext } from '../context';

export type GigaMcpHandler = (context: GigaMcpContext, args: Record<string, unknown>) => Promise<unknown>;

export type GigaMcpToolGroup = {
  handlers: Record<string, GigaMcpHandler>;
  tools: McpTool[];
};

export const schema = objectSchema;
export const stringProp = (description: string) => ({ type: 'string', description });
export const boolProp = (description: string) => ({ type: 'boolean', description });
export const jsonProp = (description: string) => ({ description });
export const limit = (value: unknown, fallback = 50) => Math.min(Math.max(Number(value) || fallback, 1), 100);

export const inputRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const requireRecord = (label: string, value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError(`${label} must be an object.`);
  return value as Record<string, unknown>;
};

export const enforceKeys = (label: string, value: Record<string, unknown>, keys: readonly string[]) => {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new BadRequestError(`${label}.${key} is not supported.`);
};

export const pathSegments = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => toSafeString(item)).filter(Boolean);
  return toSafeString(value)
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const workflowScope = (value: unknown) => {
  const scope = toSafeString(value).toLowerCase();
  return scope === 'organization' || scope === 'global' ? scope : 'user';
};

export const stringList = (value: unknown) => (Array.isArray(value) ? value.map((item) => toSafeString(item)).filter(Boolean) : []);
