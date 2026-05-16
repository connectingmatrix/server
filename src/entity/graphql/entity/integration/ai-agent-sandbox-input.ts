import { recordFromEntries, type AgentEntryField } from '../contracts/ai-agent-entry-fields';
import type {
  AgentCapability,
  AgentManifest,
  AgentPermission,
  AgentPermissionPolicy,
  AgentSandboxConfig,
  AgentShape,
  AgentSkill,
  AgentSkillBinding,
  AgentCreationAttachment,
} from '@connectingmatrix/ai-agents/services/ai-agents/contracts';

type GraphqlSkill = Omit<AgentSkill, 'inputShape' | 'outputShape' | 'metadata'> & {
  inputShape?: AgentEntryField[];
  outputShape?: AgentEntryField[];
  metadata?: AgentEntryField[];
};
type GraphqlManifest = Omit<AgentManifest, 'entries' | 'metadata' | 'skills'> & {
  skills: GraphqlSkill[];
  entries?: AgentEntryField[];
  metadata?: AgentEntryField[];
};
type GraphqlShape = {
  input: AgentEntryField[];
  output: AgentEntryField[];
  artifacts: AgentEntryField[];
  events: AgentEntryField[];
  confirmation: AgentEntryField[];
  metadata: AgentEntryField[];
};
type GraphqlBinding = Omit<AgentSkillBinding, 'config'> & { config: AgentEntryField[] };
export type AgentSandboxGraphqlInput = {
  sandboxConfig?: AgentSandboxConfig;
  capabilities?: AgentCapability[];
  skills?: GraphqlSkill[];
  permissions?: AgentPermission[];
  manifest?: GraphqlManifest;
  shape?: GraphqlShape;
  skillBindings?: GraphqlBinding[];
  permissionPolicy?: AgentPermissionPolicy;
  creationAttachments?: AgentCreationAttachment[];
};
type AgentSandboxResolvedInput = {
  sandboxConfig?: AgentSandboxConfig;
  capabilities?: AgentCapability[];
  skills?: AgentSkill[];
  permissions?: AgentPermission[];
  manifest?: AgentManifest;
  shape?: AgentShape;
  skillBindings?: AgentSkillBinding[];
  permissionPolicy?: AgentPermissionPolicy;
  creationAttachments?: AgentCreationAttachment[];
};

export function agentSandboxInput<T extends AgentSandboxGraphqlInput>(input: T): Omit<T, keyof AgentSandboxGraphqlInput> & AgentSandboxResolvedInput {
  const skills: AgentSkill[] = [];
  for (const skill of input.skills || [])
    skills.push({
      ...skill,
      inputShape: recordFromEntries(skill.inputShape),
      outputShape: recordFromEntries(skill.outputShape),
      metadata: recordFromEntries(skill.metadata),
    });
  const manifestSkills: AgentSkill[] = [];
  for (const skill of input.manifest?.skills || [])
    manifestSkills.push({
      ...skill,
      inputShape: recordFromEntries(skill.inputShape),
      outputShape: recordFromEntries(skill.outputShape),
      metadata: recordFromEntries(skill.metadata),
    });
  const bindings: AgentSkillBinding[] = [];
  for (const binding of input.skillBindings || []) bindings.push({ ...binding, config: recordFromEntries(binding.config) });
  return {
    ...input,
    skills: skills.length ? skills : undefined,
    manifest: input.manifest
      ? {
          ...input.manifest,
          skills: manifestSkills,
          entries: recordFromEntries(input.manifest.entries),
          metadata: recordFromEntries(input.manifest.metadata),
        }
      : undefined,
    shape: input.shape
      ? {
          input: recordFromEntries(input.shape.input),
          output: recordFromEntries(input.shape.output),
          artifacts: recordFromEntries(input.shape.artifacts),
          events: recordFromEntries(input.shape.events),
          confirmation: recordFromEntries(input.shape.confirmation),
          metadata: recordFromEntries(input.shape.metadata),
        }
      : undefined,
    skillBindings: bindings.length ? bindings : undefined,
  } as Omit<T, keyof AgentSandboxGraphqlInput> & AgentSandboxResolvedInput;
}
