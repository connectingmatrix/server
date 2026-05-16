import { parseStringValue } from 'giga-ai-helper/workflow';

export type AgentEntryField = { key: string; value: string; valueType?: string | null };
export type AgentEntryRecord = Record<string, unknown>;

export const entriesForGraphql = (record: AgentEntryRecord | null | undefined): AgentEntryField[] => {
  const entries: AgentEntryField[] = [];
  for (const [key, value] of Object.entries(record || {}))
    entries.push({ key, value: parseStringValue(value) || JSON.stringify(value || ''), valueType: 'string' });
  return entries;
};

export const recordFromEntries = (entries: AgentEntryField[] | null | undefined): AgentEntryRecord => {
  const record: AgentEntryRecord = {};
  for (const entry of entries || []) record[entry.key] = entry.value;
  return record;
};
