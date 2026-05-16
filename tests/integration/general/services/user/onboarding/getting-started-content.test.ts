import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTextFromFile } from 'giga-ai-helper';
import { buildGettingStartedMarkdown } from '@giga/general/services/user/onboarding/systems/guide-content';
import { renderGettingStartedPdf } from '@giga/general/services/user/onboarding/systems/pdf';
import { GETTING_STARTED_WORKFLOW_NODES } from '@giga/general/services/user/onboarding/systems/workflow-node-reference.generated';

const sample = {
  categoryId: 'category-id',
  channelId: 'channel-id',
  channelName: 'Test User',
  postId: 'post-id',
  subjectId: 'subject-id',
};

test('getting started markdown includes every workflow node reference', () => {
  const markdown = buildGettingStartedMarkdown(sample);
  for (const node of GETTING_STARTED_WORKFLOW_NODES) {
    assert.match(markdown, new RegExp(`\\| ${node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|`));
  }
});

test('getting started PDF is extractable by the attachment parser', async () => {
  const markdown = buildGettingStartedMarkdown(sample);
  const buffer = renderGettingStartedPdf(markdown);
  const text = await extractTextFromFile({
    buffer,
    mimetype: 'application/pdf',
    originalname: 'giga-getting-started.pdf',
    size: buffer.length,
  } as Express.Multer.File);

  assert.match(text, /Getting Started With Giga Intelligence/);
});
