import { entriesForGraphql } from './ai-agent-entry-fields';
import type { AgentManifest, AgentShape, AgentSkill, AgentSkillBinding } from '@connectingmatrix/ai-agents/services/ai-agents/contracts';

export const skillsForGraphql = (skills: AgentSkill[] | null | undefined) => {
  const output = [];
  for (const skill of skills || [])
    output.push({
      ...skill,
      inputShape: entriesForGraphql(skill.inputShape),
      outputShape: entriesForGraphql(skill.outputShape),
      metadata: entriesForGraphql(skill.metadata),
    });
  return output;
};

export const skillBindingsForGraphql = (bindings: AgentSkillBinding[] | null | undefined) => {
  const output = [];
  for (const binding of bindings || []) output.push({ ...binding, config: entriesForGraphql(binding.config) });
  return output;
};

export const shapeForGraphql = (shape: AgentShape | null | undefined) =>
  shape
    ? {
        input: entriesForGraphql(shape.input),
        output: entriesForGraphql(shape.output),
        artifacts: entriesForGraphql(shape.artifacts),
        events: entriesForGraphql(shape.events),
        confirmation: entriesForGraphql(shape.confirmation),
        metadata: entriesForGraphql(shape.metadata),
      }
    : null;

export const manifestForGraphql = (manifest: AgentManifest | null | undefined) =>
  manifest
    ? {
        ...manifest,
        skills: skillsForGraphql(manifest.skills),
        entries: entriesForGraphql(manifest.entries),
        metadata: entriesForGraphql(manifest.metadata),
      }
    : null;
