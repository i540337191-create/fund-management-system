import {formatAmountLabel} from './amountLabel.ts';
import { dictionary } from './dictionary.ts';
import type { Locale } from './locale';
const cjk = /[\u3400-\u9fff]/;
const phrases = Object.keys(dictionary).filter(key => key.length > 1).sort((a, b) => b.length - a.length);
const phrasePattern = new RegExp(phrases.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const cache = new Map<string, string>();
export function translate(text: string, locale: Locale = 'en'): string {
  if (locale === 'zh' || !cjk.test(text)) return text;
  const amount = formatAmountLabel(text);
  if (amount !== null) return amount;
  const dynamic = dynamicText(text, locale);
  if (dynamic !== null) return dynamic;
  const cached = cache.get(text); if (cached !== undefined) return cached;
  const trimmed = text.trim(), exact = dictionary[trimmed] ?? dictionary[trimmed.replace(/\s+/g, ' ')];
  let result: string;
  if (exact !== undefined) result = text.replace(trimmed, exact);
  else {
    result = text.replace(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?/g, (_, year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
      .replace(/(\d{4})年\s*(\d{1,2})月/g, (_, year, month) => `${year}-${String(month).padStart(2, '0')}`)
      .replace(/(\d{1,2})月\s*(\d{1,2})日/g, (_, month, day) => `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
      .replace(/[\u3400-\u9fff]+/g, run => dictionary[run] === undefined ? run : ` ${dictionary[run]} `)
      .replace(phrasePattern, match => ` ${dictionary[match]} `)
      .replace(/ +/g, ' ').replace(/\s+([,.;:!?%)\]])/g, '$1').replace(/([([])\s+/g, '$1')
      .replace(/，/g, ', ').replace(/。/g, '. ').replace(/：/g, ': ').replace(/；/g, '; ').replace(/（/g, '(').replace(/）/g, ')').replace(/、/g, ', ').trim();
    if (cjk.test(result)) result = text;
    if (text.startsWith(' ') && !result.startsWith(' ')) result = ' ' + result;
    if (text.endsWith(' ') && !result.endsWith(' ')) result += ' ';
  }
  if (cache.size > 10000) cache.clear();
  cache.set(text, result); return result;
}
export function containsUntranslatedChinese(text: string): boolean { return cjk.test(translate(text)); }

function dynamicText(text: string, locale: Locale): string | null {
  let match = text.match(/^共\s*(\d+)\s*条\s*·\s*共\s*(\d+)\s*页\s*·\s*每页\s*(\d+)\s*条$/);
  if (match) return `${match[1]} ${match[1] === '1' ? 'record' : 'records'} · ${match[2]} ${match[2] === '1' ? 'page' : 'pages'} · ${match[3]} per page`;
  match = text.match(/^展开(.+)的(\d+)项待办$/);
  if (match) return `Expand ${match[2]} tasks for ${translate(match[1], locale)}`;
  match = text.match(/^AI收件箱[，,]\s*(\d+)项待处理$/);
  if (match) return `AI inbox, ${match[1]} pending items`;
  match = text.match(/^通知[，,]\s*(\d+)条未读$/);
  if (match) return `Notifications, ${match[1]} unread`;
  match = text.match(/^(.+?)(\d+)个项目[，,]占比\s*(\d+(?:\.\d+)?)%$/);
  if (match) return `${translate(match[1], locale)}: ${match[2]} ${match[2] === '1' ? 'project' : 'projects'} (${match[3]}%)`;
  match = text.match(/^资金口径待完善\s*·\s*含(\d+)只模拟基金$/);
  if (match) return `Incomplete capital records · ${match[1]} demo funds`;
  match = text.match(/^(\s*·\s*)?含(\d+)只模拟基金$/);
  if (match) return `${match[1] ?? ''}${match[1] ? '' : 'Includes '}${match[2]} demo funds`;
  match = text.match(/^查阅(.+)的企业档案$/);
  if (match) return `View company record for ${translate(match[1], locale)}`;
  match = text.match(/^虚构(.+)项目，用于展示基金与项目之间的业务关联。$/);
  if (match) return `Fictional ${translate(match[1], locale).toLowerCase()} project demonstrating fund and project relationships.`;
  match = text.match(/^演示机构投资人(\d+)$/);
  if (match) return `Demo Institutional Investor ${match[1]}`;
  match = text.match(/^(.+)季度运营报告（演示）$/);
  if (match) return `${translate(match[1], locale)} Quarterly Operating Report (Demo)`;
  match = text.match(/^(.+)项目进展会议$/);
  if (match) return `${translate(match[1], locale)} Project Progress Meeting`;
  match = text.match(/^选中资料[：:]\s*(.+)$/);
  if (match) return `Selected document: ${translate(match[1], locale)}`;
  match = text.match(/^正在核查资料\s*(\d+)\/(\d+)$/);
  if (match) return `Reviewing documents ${match[1]}/${match[2]}`;
  match = text.match(/^已核查\s*(\d+)\s*份正文\s*·\s*建议待人工复核$/);
  if (match) return `Reviewed ${match[1]} documents · Suggestions require manual review`;
  match = text.match(/^已核查\s*(\d+)\s*份原件正文；AI建议待人工复核。$/);
  if (match) return `Reviewed ${match[1]} original documents. AI suggestions require manual review.`;
  match = text.match(/^(.+)[：:]待补原件\s*(\d+)\s*项，待读取\s*(\d+)\s*项。$/);
  if (match) return `${translate(match[1], locale)}: ${match[2]} missing originals, ${match[3]} awaiting reading.`;
  match = text.match(/^(正文|OCR|转写)已完成\s*·\s*(\d+)\s*(正文片段|工作表|幻灯片|页|段|图)\s*\/\s*(\d+)\s*字$/);
  if (match) {
    const kind = {正文: 'Text extracted', OCR: 'OCR complete', 转写: 'Transcript complete'}[match[1] as '正文' | 'OCR' | '转写'];
    const unit = {正文片段: 'text section', 工作表: 'worksheet', 幻灯片: 'slide', 页: 'page', 段: 'segment', 图: 'image'}[match[3] as '正文片段' | '工作表' | '幻灯片' | '页' | '段' | '图'];
    return `${kind} · ${match[2]} ${unit}${match[2] === '1' ? '' : 's'} / ${match[4]} characters`;
  }
  match = text.match(/^查看识别结果[：:]\s*(.+)$/);
  if (match) return `View extraction results: ${translate(match[1], locale)}`;
  match = text.match(/^(上一|下一)(正文片段|工作表|幻灯片|页|段|图)$/);
  if (match) return `${match[1] === '上一' ? 'Previous' : 'Next'} ${{正文片段: 'text section', 工作表: 'worksheet', 幻灯片: 'slide', 页: 'page', 段: 'segment', 图: 'image'}[match[2] as '正文片段' | '工作表' | '幻灯片' | '页' | '段' | '图']}`;
  return null;
}
