import { jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';
import { localizedType } from './jsx-runtime.ts';
export { Fragment } from './jsx-runtime.ts';
export type { JSX } from 'react';
export const jsxDEV: typeof reactJsxDEV = (type, props, key, isStaticChildren, source, self) =>
  reactJsxDEV(localizedType(type), props, key, isStaticChildren, source, self);
