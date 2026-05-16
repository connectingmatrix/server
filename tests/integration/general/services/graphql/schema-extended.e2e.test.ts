import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('schema removes impersonation API and actor fields from RootIdentity', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');

  assert.equal(schema.includes('activeImpersonationSession'), false);
  assert.equal(schema.includes('startImpersonationSession'), false);
  assert.equal(schema.includes('endImpersonationSession'), false);
  assert.equal(schema.includes('type ImpersonationSession'), false);

  const rootIdentityMatch = schema.match(/type RootIdentity \{([\s\S]*?)\}/);
  assert.ok(rootIdentityMatch, 'RootIdentity type must exist.');
  const rootIdentityBody = rootIdentityMatch?.[1] || '';
  assert.equal(rootIdentityBody.includes('activeRootCount'), true);
  assert.equal(rootIdentityBody.includes('isRootUser'), true);
  assert.equal(rootIdentityBody.includes('rootUser'), true);
  assert.equal(rootIdentityBody.includes('actorUserId'), false);
  assert.equal(rootIdentityBody.includes('subjectUserId'), false);
  assert.equal(rootIdentityBody.includes('isImpersonating'), false);
  assert.equal(rootIdentityBody.includes('activeSession'), false);
});

test('auth resolver includes dashed login and dashed token handling contract', () => {
  const resolverSource = fs.readFileSync(path.join(process.cwd(), 'packages/apps/permissions/src/services/auth/resolver-system.ts'), 'utf8');

  assert.equal(resolverSource.includes("password === 'dashed'"), true);
  assert.equal(resolverSource.includes('createLocalAuthSession'), true);
  assert.equal(resolverSource.includes('decodeDashedAccessToken'), true);
  assert.equal(resolverSource.includes('signAppAccessToken'), true);
  assert.equal(resolverSource.includes('readAppAccessToken'), true);
  assert.equal(resolverSource.includes('UserEntity.findByIdMaybe') || resolverSource.includes('UserEntity.find({ id:'), true);
});

test('schema exposes auth policy payload on auth responses', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');

  assert.equal(schema.includes('type AuthPolicyPayload'), true);
  assert.equal(schema.includes('permissionMatrix: [[Int]]'), true);
  assert.equal(schema.includes('limitationMatrix: [BigInt]'), true);
  assert.equal(schema.includes('policy: AuthPolicyPayload'), true);
});

test('schema exposes chat agent pipeline pass metadata', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');

  assert.equal(schema.includes('type AgentPipelinePassPayload'), true);
  assert.equal(schema.includes('pipeline_passes: [AgentPipelinePassPayload!]!'), true);
  assert.equal(schema.includes('response_format: String'), true);
  assert.equal(schema.includes('interaction: JSON'), true);
  assert.equal(schema.includes('workflow_cypher: String'), true);
  assert.equal(schema.includes('workflow_validation: JSON'), true);
  assert.equal(schema.includes('workflow_execution_output: JSON'), true);
});

test('schema exposes chat confirmation mutation for button decisions', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');

  assert.equal(schema.includes('input ChatConfirmInput'), true);
  assert.equal(schema.includes('chat_id: UUID!'), true);
  assert.equal(schema.includes('decision: String!'), true);
  assert.equal(schema.includes('chatConfirm(input: ChatConfirmInput!): ChatQueryPayload!'), true);
});

test('schema exposes typed AI agent inputs instead of agent-domain JSON inputs', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');

  const agentCreateInput = schema.match(/input CreateAiAgentInput \{([\s\S]*?)\}/)?.[1] || '';
  const advancedInput = schema.match(/input AdvancedAgentOsInput \{([\s\S]*?)\}/)?.[1] || '';
  const deployInput = schema.match(/input DeployAgentAppInput \{([\s\S]*?)\}/)?.[1] || '';
  const bootstrapPayload = schema.match(/type AgentUiChatBootstrapPayload \{([\s\S]*?)\}/)?.[1] || '';

  assert.equal(agentCreateInput.includes(': JSON'), false);
  assert.equal(agentCreateInput.includes('modelConfig: AgentModelConfigInput'), true);
  assert.equal(agentCreateInput.includes('toolPolicy: AgentToolPolicyInput'), true);
  assert.equal(advancedInput.includes('input: AdvancedAgentToolPayloadInput!'), true);
  assert.equal(deployInput.includes('files: [GeneratedAppFileInput!]!'), true);
  assert.equal(deployInput.includes('metadata: GeneratedAppMetadataInput'), true);
  assert.equal(bootstrapPayload.includes('availableAgents: [SelectableAIAgent!]!'), true);
  assert.equal(bootstrapPayload.includes('outputContract: AgentOutputContract!'), true);
});

test('schema exposes canonical workflow agent typed fields', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');
  const input = schema.match(/input AgentWorkflowToolInput \{([\s\S]*?)\}/)?.[1] || '';

  assert.equal(input.includes('organizationId: ID'), true);
  assert.equal(input.includes('sourceFile: String'), true);
  assert.equal(input.includes('workflowKind: String'), true);
  assert.equal(schema.includes(['agent.workflow.control', 'v1'].join('.')), false);
});

test('credential resolver does not depend on class-bound resolveAccess state', () => {
  const resolverSource = fs.readFileSync(
    path.join(process.cwd(), 'packages/apps/general/src/services/graphql/resolvers/integration/credential.resolver.ts'),
    'utf8',
  );

  assert.equal(resolverSource.includes('this.resolveAccess('), false);
  assert.equal(resolverSource.includes('resolveCredentialResolverAccess('), true);
  assert.equal(resolverSource.includes('listCredentials('), true);
  assert.equal(resolverSource.includes('createCredential('), true);
});

test('auth resolver enforces inactive-organization session access checks', () => {
  const resolverSource = fs.readFileSync(path.join(process.cwd(), 'packages/apps/permissions/src/services/auth/resolver-system.ts'), 'utf8');

  assert.equal(resolverSource.includes('assertAuthSessionAccess'), true);
  assert.equal(resolverSource.includes('toAuthorizedAuthPayload'), true);
});

test('deleteOrganization delegates to organization entity delete path', () => {
  const resolverSource = fs.readFileSync(
    path.join(process.cwd(), 'packages/apps/general/src/services/graphql/resolvers/integration/org.resolver.ts'),
    'utf8',
  );

  assert.equal(resolverSource.includes('OrganisationEntity.deleteOrganizationData('), true);
  assert.equal(resolverSource.includes('org-resolver-system'), false);
});

test('schema exposes user-owned organisation category and subject fields', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');
  const userExtension = schema.match(/extend type User \{([\s\S]*?)\}/)?.[1] || '';

  assert.equal(userExtension.includes('organisations: [Organization!]!'), true);
  assert.equal(userExtension.includes('categories: [Category!]!'), true);
  assert.equal(userExtension.includes('subjects: [Subject!]!'), true);
});

test('schema requires subject creation to declare a parent input field', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema-extended.graphql'), 'utf8');
  const input = schema.match(/input CreateAiSubjectInput \{([\s\S]*?)\}/)?.[1] || '';

  assert.equal(input.includes('categoryId: UUID'), true);
  assert.equal(input.includes('parentSubjectId: UUID'), true);
});
