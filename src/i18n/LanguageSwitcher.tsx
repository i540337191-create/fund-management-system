import { setLocale, useLocale } from './locale';
import './language.css';
export function LanguageSwitcher() {
  const locale = useLocale();
  return <div className="language-switcher" role="group" aria-label={locale === 'en' ? 'Interface language' : '界面语言'}>
    <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
    <button type="button" lang="zh-CN" aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>中文</button>
  </div>;
}
export function DemoNotice() { return import.meta.env.VITE_DEMO_MODE === 'true' ? <span className="demo-notice">演示环境 · 全部为虚构数据</span> : null; }
