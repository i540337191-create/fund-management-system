import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
test('CI ASR setup refuses corrupted pinned artifacts before compiling or publishing runtime paths', async t => {
  const root = await mkdtemp(resolve(tmpdir(), 'ci-asr-corrupt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, 'scripts'));
  await mkdir(resolve(root, 'server/vendor/asr'), { recursive: true });
  const script = resolve(root, 'scripts/prepare-ci-asr.mjs');
  await copyFile(new URL('../scripts/prepare-ci-asr.mjs', import.meta.url), script);
  await writeFile(resolve(root, 'server/vendor/asr/whisper-v1.9.5.tar.gz'), 'corrupt synthetic source');
  const envFile = resolve(root, 'github-env');
  await writeFile(envFile, 'EXISTING_VALUE=preserved\n');
  await assert.rejects(exec(process.execPath, [script], { env: { ...process.env, GITHUB_ENV: envFile, RUNNER_TEMP: root } }), error => {
    assert.match(String((error as { stderr: string }).stderr), /Pinned ASR artifact checksum mismatch: whisper-v1\.9\.5\.tar\.gz/);
    return true;
  });
  assert.equal(await readFile(envFile, 'utf8'), 'EXISTING_VALUE=preserved\n');
});
