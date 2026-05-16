import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SHARED_SPACE_ROOT } from '@giga/general/services/shared-space/constants';
import { assertWritable, copyPath, statFile, writeText } from '@giga/general/services/shared-space/file-ops';
import { drivePath, hostPath } from '@giga/general/services/shared-space/path';

test('shared space root uses env override before platform defaults', () => {
  const previous = process.env.GIGA_SHARED_SPACE_ROOT;
  process.env.GIGA_SHARED_SPACE_ROOT = '/tmp/custom-giga-drive';
  assert.equal(SHARED_SPACE_ROOT(), '/tmp/custom-giga-drive');
  if (previous) process.env.GIGA_SHARED_SPACE_ROOT = previous;
  else delete process.env.GIGA_SHARED_SPACE_ROOT;
});

test('shared space paths must stay under /drive', () => {
  const root = mkdtempSync(join(tmpdir(), 'giga-drive-path-'));
  assert.equal(drivePath('/drive/a/b.json'), '/a/b.json');
  assert.throws(() => drivePath('/etc/passwd'), /must use/);
  assert.throws(() => hostPath(root, '/drive/../secret'), /not allowed/);
});

test('shared space rejects executable names and hardlinks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'giga-drive-hardlink-'));
  assert.throws(() => writeText(root, '/drive/run.sh', 'echo bad'), /Executable/);
  writeFileSync(join(root, 'source.txt'), 'ok');
  linkSync(join(root, 'source.txt'), join(root, 'linked.txt'));
  await assert.rejects(() => statFile(root, '/drive/source.txt'), /Hard links/);
});

test('shared space rejects symlinks and quota overflow', async () => {
  const root = mkdtempSync(join(tmpdir(), 'giga-drive-symlink-'));
  writeFileSync(join(root, 'target.txt'), 'ok');
  symlinkSync(join(root, 'target.txt'), join(root, 'link.txt'));
  await assert.rejects(() => statFile(root, '/drive/link.txt'), /Symbolic links/);
  assert.throws(() => assertWritable({ quotaBytes: 5, usedBytes: 4 }, 2), /quota exceeded/);
});

test('shared space copy writes compact file metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'giga-drive-copy-'));
  writeText(root, '/drive/source.json', '{"ok":true}');
  const copied = copyPath(root, '/drive/source.json', '/drive/copied.json');
  assert.equal(copied.path, '/drive/copied.json');
  assert.equal(copied.kind, 'file');
});
