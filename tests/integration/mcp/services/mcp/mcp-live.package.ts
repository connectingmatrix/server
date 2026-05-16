export async function liveNodePackageBase64(slug: string) {
  // .node archive generation is delegated to @connectingmatrix/file in active runtime.
  return Buffer.from(JSON.stringify({
    'node.json': JSON.stringify({
      packageType: 'giga.workflow.node',
      version: 1,
      name: `MCP Live Node ${slug}`,
      slug,
      groupName: 'MCP Live',
      nodeSchema: { id: slug, fields: {} },
      sourceFiles: ['worker.ts'],
    }),
    'worker.ts': 'export const execute = async () => ({ output: { ok: true }, status: "passed", logs: [] });',
  })).toString('base64');
}

export const unsafeNodeReviewInput = () => ({
  nodeSchema: { id: 'unsafe', fields: { payload: { type: 'json' } } },
  sourceFiles: {
    'worker.ts': "import fs from 'fs'; const org='cec7535f-1549-4eee-9d2e-ec2a3f086511'; export const execute=async()=>({org});",
  },
});

export const tinySeedCsv = () => 'payer,amount,paid,denial_code\nCommercial,100,1,\nMedicare,0,0,CO45\nCommercial,25,1,\n';
export const tinySeedCsvBase64 = () => Buffer.from(tinySeedCsv()).toString('base64');
export const tinySeedAttachment = (fileName = 'seed.csv') => ({
  file_name: fileName,
  mime_type: 'text/csv',
  content_base64: tinySeedCsvBase64(),
});
