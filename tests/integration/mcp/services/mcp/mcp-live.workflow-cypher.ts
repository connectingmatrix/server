const featureDefinition = {
  target: 'paid',
  allowedFields: ['payer', 'amount', 'denial_code'],
  excludedSensitiveFields: [],
  aliases: { payer_type: 'payer' },
  encodings: { payer: { type: 'categorical' }, amount: { type: 'numeric' }, denial_code: { type: 'categorical' } },
  positiveValues: ['1', 'true', 'paid'],
  modelSettings: { maxDepth: 3, hashSize: 64 },
  rationale: ['Tiny PHI-safe live fixture.'],
  sensitiveSafe: true,
};

const scoringModel = {
  modelType: 'decision-tree',
  target: 'paid',
  featureDefinition,
  metrics: { rows: 3, positives: 2, baseRate: 0.6667, ruleCount: 1 },
  rules: [{ conditions: [{ field: 'payer', value: 'Commercial' }], total: 2, positive: 2, confidence: 1, lift: 0.3333 }],
  checksum: 'fixture-tree',
  sensitiveSafe: true,
};

const nodeLine = (alias: string, modelId: string, name: string, runtime: Record<string, unknown>) =>
  `(${alias}:${modelId} ${JSON.stringify({ name, runtime })})`;
const toolEdge = (alias: string) => `(${alias})-[:CONNECT {"source":"cmd:command","target":"cmd:tools"}]->(agent)`;

export function mcpToolCypher(input: { organizationId: string; credentialId: string; driveRoot: string }) {
  const csv = `${input.driveRoot}/seed.csv`;
  return [
    nodeLine('mcpRuntimeTool', 'mcp-runtime', 'MCP Runtime', { description: 'Call approved Giga MCP tools.', credentialId: input.credentialId }),
    nodeLine('featureTool', 'feature-analysis', 'Feature Analysis', {
      sourceFile: csv,
      target: 'paid',
      analysisPrompt: 'Use PHI-safe aggregate summaries only.',
      llmResponse: JSON.stringify(featureDefinition),
    }),
    nodeLine('treeTrainerTool', 'decision-tree-trainer', 'Decision Tree Trainer', {
      sourceFile: csv,
      target: 'paid',
      featureDefinition,
      maxDepth: 3,
      minSupport: 1,
    }),
    nodeLine('neuralTrainerTool', 'neural-net-trainer', 'Neural Net Trainer', {
      sourceFile: csv,
      target: 'paid',
      featureDefinition,
      hashSize: 64,
      epochs: 1,
    }),
    nodeLine('modelScorerTool', 'model-scorer', 'Model Scorer', { scenario: '{"payer":"Commercial","amount":"100"}', model: scoringModel }),
    nodeLine('artifactPublishTool', 'workflow-artifact-publish', 'Workflow Artifact Publish', {}),
    ...['mcpRuntimeTool', 'featureTool', 'treeTrainerTool', 'neuralTrainerTool', 'modelScorerTool', 'artifactPublishTool'].map(toolEdge),
  ].join('\n');
}
