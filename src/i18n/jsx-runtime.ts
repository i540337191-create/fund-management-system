import {markHostType} from './hostIdentity.ts';
import { createElement, forwardRef, type ElementType } from 'react';
import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from 'react/jsx-runtime';
import { useLocale } from './locale.ts';
import { localizeHostProps } from './presentation.ts';
export { Fragment };
export type { JSX } from 'react';
const hosts = new Map<string, ElementType>();
export function localizedType(type: ElementType) {
  if (typeof type !== 'string') return type;
  let host = hosts.get(type);
  if (!host) {
    const tag = type;
    host = forwardRef<unknown, Record<string, unknown>>(function LocalizedHost(props, ref) {
      const locale = useLocale();
      return createElement(tag, { ...localizeHostProps(tag, props, locale), ref });
    }) as ElementType;
    markHostType(host as object, tag);
    hosts.set(type, host);
  }
  return host;
}
export function jsx(type: ElementType, props: Record<string, unknown>, key?: string) { return reactJsx(localizedType(type), props, key); }
export function jsxs(type: ElementType, props: Record<string, unknown>, key?: string) { return reactJsxs(localizedType(type), props, key); }
