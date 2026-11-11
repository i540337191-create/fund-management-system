import { useSyncExternalStore } from 'react';
export type Locale = 'en' | 'zh';
export const localeStorageKey = 'fund-management.locale';
let locale: Locale = 'en';
try { if (localStorage.getItem(localeStorageKey) === 'zh') locale = 'zh'; } catch { /* Storage can be disabled. */ }
const listeners = new Set<() => void>();
export function getLocale(): Locale { return locale; }
export function setLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  try { localStorage.setItem(localeStorageKey, next); } catch { /* The current session still switches. */ }
  syncDocumentLanguage();
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useLocale() { return useSyncExternalStore(subscribe, getLocale, getLocale); }
export function syncDocumentLanguage() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('translate', 'no');
  document.documentElement.classList.add('notranslate');
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.title = locale === 'en' ? 'Fund Management System' : '基金管理系统';
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === localeStorageKey) setLocale(event.newValue === 'zh' ? 'zh' : 'en');
});
syncDocumentLanguage();
