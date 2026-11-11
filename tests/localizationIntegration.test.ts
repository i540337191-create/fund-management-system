import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => Promise<T>, accepts: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { const result = await read(); if (accepts(result)) return result; await delay(100); }
  throw Error('Live module/optimizer condition was not reached within 15 seconds');
}

test('real Vite optimizer leaves JSX adapters as live source and dictionary edits update served/rendered translations', {timeout: 40000}, async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'fund-i18n-vite-'));
  const dictionaryPath = new URL('../src/i18n/dictionary.ts', import.meta.url);
  const original = await readFile(dictionaryPath, 'utf8');
  const probe = `本地语言热更新验证${process.pid}`;
  const withProbe = (value: string) => original.replace('\n`;', `\n${probe}|${value}\n\`;`);
  const server = await createServer({cacheDir, server: {port: 0, hmr: false}, logLevel: 'error'});
  try {
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://localhost:${address.port}`;
    const main = await (await fetch(base + '/src/main.tsx')).text();
    assert.match(main, /\/src\/i18n\/jsx-dev-runtime\.ts/);
    assert.doesNotMatch(main, /deps\/(?:@fund|#fund|_fund).*jsx/);
    await server.environments.client.depsOptimizer?.scanProcessing;
    const metadata = await until(async () => server.environments.client.depsOptimizer!.metadata, value => Boolean(value.optimized.react));
    for (const [id, dep] of Object.entries(metadata.optimized)) {
      assert.ok(!id.includes('fund/i18n'), id);
      assert.ok(!dep.src?.includes('/src/i18n/'), dep.src);
    }
    assert.ok(!server.config.optimizeDeps.include?.some(id => id.includes('fund/i18n')));
    const disk = await until(async () => {
      try { return JSON.parse(await readFile(path.join(cacheDir, 'deps/_metadata.json'), 'utf8')); } catch { return null; }
    }, value => Boolean(value?.optimized?.react));
    assert.ok(!Object.keys(disk.optimized).some(id => id.includes('fund/i18n')));

    await writeFile(dictionaryPath, withProbe('Live dictionary version one'));
    await until(async () => (await server.ssrLoadModule('/src/i18n/translate.ts')).translate(probe), value => value === 'Live dictionary version one');
    const current = await readFile(dictionaryPath, 'utf8');
    await writeFile(dictionaryPath, current.replace(`${probe}|Live dictionary version one`, `${probe}|Live dictionary version two`));
    await until(async () => (await server.ssrLoadModule('/src/i18n/translate.ts')).translate(probe), value => value === 'Live dictionary version two');
    const served = await (await fetch(base + '/src/i18n/dictionary.ts?t=' + Date.now())).text();
    assert.ok(served.includes('Live dictionary version two'));
    assert.ok(!served.includes('Live dictionary version one'));
    const translated = (await server.ssrLoadModule('/src/i18n/translate.ts')).translate;
    assert.equal(translated('示例价值基金'), 'Sample Value Fund');
    assert.equal(translated('高风险'), 'High risk');
  } finally {
    const current = await readFile(dictionaryPath, 'utf8');
    await writeFile(dictionaryPath, current.split('\n').filter(line => !line.startsWith(probe + '|')).join('\n'));
    await server.close();
    await rm(cacheDir, {recursive: true, force: true});
  }
});

test('shared Table preserves native and localized row identity, fragments, mobile headings and semantic data labels', async () => {
  const server = await createServer({configFile: false, optimizeDeps: {noDiscovery: true, include: []}, server: {middlewareMode: true, hmr: false}, appType: 'custom', logLevel: 'error'});
  try {
    const {Table} = await server.ssrLoadModule('/src/components/ui.tsx');
    const {jsx, jsxs, Fragment} = await server.ssrLoadModule('/src/i18n/jsx-runtime.ts');
    const {setLocale} = await server.ssrLoadModule('/src/i18n/locale.ts');
    const rows = jsx(Fragment, {children: [
      jsxs('tr', {className: 'custom-row', children: [jsx('td', {children: '示例价值基金'}), jsx('td', {'data-label': '基金阶段', children: '初筛'})]}, 'localized'),
      createElement('tr', {key: 'native'}, createElement('td', null, 'Native row'), createElement('td', null, 'Native cell')),
    ]});
    const element = createElement(Table, {headers: ['基金名称', '状态'], children: rows});
    const en = renderToStaticMarkup(element);
    assert.equal((en.match(/responsive-table-row/g) ?? []).length, 2);
    assert.equal((en.match(/responsive-table-cell/g) ?? []).length, 4);
    assert.match(en, /data-label="基金名称"[^>]*data-display-label="Fund name"/);
    assert.match(en, /data-label="基金阶段"[^>]*data-display-label="Fund stage"/);
    assert.match(en, /responsive-table-row custom-row/);
    assert.match(en, /Sample Value Fund/);
    setLocale('zh');
    const zh = renderToStaticMarkup(element);
    assert.match(zh, /data-label="基金名称"[^>]*data-display-label="基金名称"/);
    assert.match(zh, /data-label="基金阶段"[^>]*data-display-label="基金阶段"/);
    assert.match(zh, /示例价值基金/);
  } finally { await server.close(); }
});
