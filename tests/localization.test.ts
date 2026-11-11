import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/i18n/translate.ts';
import { localizeHostProps } from '../src/i18n/presentation.ts';
import { getLocale, setLocale, localeStorageKey } from '../src/i18n/locale.ts';

test('English is the default, switching persists and Chinese restores exact original copy', () => {
  assert.equal(getLocale(), 'en');
  const writes: string[][] = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string, value: string) => writes.push([key, value]) } });
  setLocale('zh');
  assert.equal(translate('新建基金', getLocale()), '新建基金');
  assert.deepEqual(writes.at(-1), [localeStorageKey, 'zh']);
  setLocale('en');
  assert.equal(translate('新建基金', getLocale()), 'New fund');
  assert.deepEqual(writes.at(-1), [localeStorageKey, 'en']);
  Reflect.deleteProperty(globalThis, 'localStorage');
});

test('option labels are English but all business values stay unchanged', () => {
  assert.deepEqual(localizeHostProps('option', { children: '初筛' }, 'en'), { children: 'Screening', value: '初筛' });
  assert.equal(localizeHostProps('option', { children: ['初筛', ' / ', '立项'] }, 'en').value, '初筛 / 立项');
  assert.deepEqual(localizeHostProps('option', { children: '示例成长一期基金', value: 'fund-demo-growth' }, 'en'), { children: 'Sample Growth Fund I', value: 'fund-demo-growth' });
  const onChange = () => undefined;
  const props = { value: '初筛', defaultValue: '立项', name: 'stage', id: 'stage', onChange, children: [] };
  const localized = localizeHostProps('select', props, 'en');
  for (const key of ['value', 'defaultValue', 'name', 'id', 'onChange']) assert.equal(localized[key], props[key as keyof typeof props]);
});

test('pending form text, form data and URLs never change with the interface language', () => {
  const props = { value: '我的新基金', defaultValue: '草稿', placeholder: '请输入账号', title: '基金名称', 'aria-label': '基金名称', 'data-fund-id': '基金-001' };
  const english = localizeHostProps('input', props, 'en');
  assert.equal(english.value, props.value);
  assert.equal(english.defaultValue, props.defaultValue);
  assert.equal(english['data-fund-id'], props['data-fund-id']);
  assert.equal(english.placeholder, 'Enter your account');
  assert.equal(english.title, 'Fund name');
  assert.equal(english['aria-label'], 'Fund name');
  assert.deepEqual(localizeHostProps('input', english, 'zh').value, props.value);
  assert.equal(localizeHostProps('textarea', { children: '新建基金' }, 'en').children, '新建基金');
  assert.equal(localizeHostProps('a', { href: '/projects?tab=初筛', children: '查看项目' }, 'en').href, '/projects?tab=初筛');
});

test('dynamic counts, dates, status and synthetic names translate in rendered text only', () => {
  assert.equal(translate('示例成长一期基金 · 待审核'), 'Sample Growth Fund I · Pending review');
  assert.equal(translate('2026年11月11日'), '2026-11-11');
  assert.equal(translate('共 12 项'), 'Total 12 items');
  assert.equal(translate('演示清洁能源有限公司'), 'Demo Clean Energy Ltd.');
  assert.equal(translate('Not saved / 2026-11-11'), 'Not saved / 2026-11-11');
  const element = { type: 'span', props: { children: '项目' } };
  assert.equal((localizeHostProps('div', { children: ['项目', 12, element] }, 'en').children as unknown[])[2], element);
});

test('required review and failure states retain their meaning', () => {
  assert.match(translate('当前账号没有基金维护权限。'), /cannot maintain funds/);
  assert.match(translate('请先完成下方人工核对确认，再保存基金。'), /manual review/);
  assert.match(translate('风险有未保存内容，确认关闭？'), /unsaved changes/);
  assert.equal(translate('已逾期', 'zh'), '已逾期');
});


test('unknown copy never becomes a mixed fragment through single-character replacement', () => {
  assert.equal(translate('中文'), '中文');
  assert.equal(translate('全新自定义中文公司'), '全新自定义中文公司');
  assert.equal(translate('不可识别的全新说明包含项目与基金'), '不可识别的全新说明包含项目与基金');
});

test('actual React host rendering localizes labels without changing business submission values', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { jsx, jsxs } = await import('../src/i18n/jsx-runtime.ts');
  const element = jsxs('form', { children: [
    jsx('label', { children: '项目名称' }),
    jsx('input', { name: 'name', defaultValue: '我的中文公司', placeholder: '请输入账号' }),
    jsx('select', { name: 'stage', defaultValue: '初筛', children: jsx('option', { children: '初筛' }) }),
  ] });
  const en = renderToStaticMarkup(element);
  assert.match(en, /Project name/);
  assert.match(en, /Enter your account/);
  assert.match(en, /value="初筛" selected="">Screening/);
  assert.match(en, /value="我的中文公司"/);
  setLocale('zh');
  const zh = renderToStaticMarkup(element);
  assert.match(zh, /项目名称/);
  assert.match(zh, /value="初筛" selected="">初筛/);
  assert.match(zh, /value="我的中文公司"/);
  setLocale('en');
});


test('Chinese textual amount units keep exact numeric meaning and explicit currency only', async () => {
  const { formatAmountLabel } = await import('../src/i18n/amountLabel.ts');
  assert.equal(formatAmountLabel('5,000 万元'), 'CNY 50M');
  assert.equal(formatAmountLabel('1.00 亿元'), 'CNY 100M');
  assert.equal(formatAmountLabel('1.00 亿'), '100M');
  assert.equal(formatAmountLabel('12.345678 万元'), 'CNY 123.45678K');
  assert.equal(formatAmountLabel('0.00000000001亿元'), 'CNY 0.001');
  assert.equal(formatAmountLabel('-1.25万元'), 'CNY -12.5K');
  assert.equal(formatAmountLabel('0元'), 'CNY 0');
  assert.equal(formatAmountLabel('人民币 1.5亿'), 'CNY 150M');
  assert.equal(formatAmountLabel('万科公司'), null);
  assert.equal(translate('5,000 万元'), 'CNY 50M');
  assert.equal(translate('5,000 万元', 'zh'), '5,000 万元');
  assert.equal(localizeHostProps('input', { value: '5,000 万元' }, 'en').value, '5,000 万元');
});

test('dynamic pagination, notifications, task expansion and charts use natural English', () => {
  assert.equal(translate('共 4 条 · 共 1 页 · 每页 10 条'), '4 records · 1 page · 10 per page');
  assert.equal(translate('AI收件箱，0项待处理'), 'AI inbox, 0 pending items');
  assert.equal(translate('通知，9条未读'), 'Notifications, 9 unread');
  assert.equal(translate('展开演示智能设备有限公司的2项待办'), 'Expand 2 tasks for Demo Smart Devices Ltd.');
  assert.equal(translate('初筛1个项目，占比17%'), 'Screening: 1 project (17%)');
});

test('split demo-fund warning translates independently', () => {
  assert.equal(translate('含4只模拟基金', 'en'), 'Includes 4 demo funds');
  assert.equal(translate(' · 含4只模拟基金', 'en'), ' · 4 demo funds');
});
