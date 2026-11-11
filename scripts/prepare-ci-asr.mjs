#!/usr/bin/env node
// Build the same pinned offline CPU ASR runtime used by the API Docker image.
import { createReadStream } from 'node:fs';
import { appendFile, mkdtemp, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = resolve(root, 'server/vendor/asr');
for (const [name, expected] of [
  ['whisper-v1.9.5.tar.gz', 'ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720'],
  ['ggml-small-q5_1.bin', 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'],
]) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolve(vendor, name))) hash.update(chunk);
  assert.equal(hash.digest('hex'), expected, `Pinned ASR artifact checksum mismatch: ${name}`);
}
const workspace = await mkdtemp(resolve(process.env.RUNNER_TEMP || tmpdir(), 'fund-ci-asr-'));
const source = resolve(workspace, 'source');
const build = resolve(workspace, 'build');
await mkdir(source);
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
run('tar', ['-xzf', resolve(vendor, 'whisper-v1.9.5.tar.gz'), '-C', source, '--strip-components=1']);
run('cmake', ['-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_CURL=OFF']);
run('cmake', ['--build', build, '--target', 'whisper-cli', '-j', '4']);
const binary = resolve(build, 'bin/whisper-cli');
execFileSync(binary, ['--help'], { stdio: 'ignore' });
const settings = `ASR_WHISPER_BIN=${binary}\nASR_MODEL_PATH=${resolve(vendor, 'ggml-small-q5_1.bin')}\n`;
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, settings);
process.stdout.write(settings);
