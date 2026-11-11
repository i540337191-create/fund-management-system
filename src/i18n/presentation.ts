import { translate } from './translate.ts';
import type { Locale } from './locale';
function textChildren(children: unknown, locale: Locale): unknown {
  if (typeof children === 'string') return translate(children, locale);
  if (Array.isArray(children)) return children.map(child => textChildren(child, locale));
  return children;
}
function originalOptionText(children: unknown): string | undefined {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (children == null || typeof children === 'boolean') return '';
  if (!Array.isArray(children)) return undefined;
  const parts = children.map(originalOptionText);
  return parts.every(part => part !== undefined) ? parts.join('') : undefined;
}
export function localizeHostProps(tag: string, props: Record<string, unknown>, locale: Locale): Record<string, unknown> {
  const result = { ...props };
  if (typeof props['aria-label'] === 'string') result['data-i18n-label'] = props['aria-label'];
  if (typeof props['data-label'] === 'string') result['data-display-label'] = translate(props['data-label'], locale);
  // Never translate controlled values, defaults, IDs, URLs, handlers, or editable user input.
  if (tag !== 'textarea' && tag !== 'script' && tag !== 'style' && !props.contentEditable) result.children = textChildren(props.children, locale);
  for (const attribute of ['title', 'placeholder', 'aria-label', 'aria-description', 'aria-valuetext', 'alt', 'label']) {
    if (typeof props[attribute] === 'string') result[attribute] = translate(props[attribute] as string, locale);
  }
  // An option without an explicit value submits its label; retain the original business value.
  if (tag === 'option' && props.value === undefined) {
    const value = originalOptionText(props.children);
    if (value !== undefined) result.value = value;
  }
  if (tag === 'input' && ['button', 'submit', 'reset'].includes(String(props.type)) && typeof props.value === 'string') result.value = translate(props.value, locale);
  return result;
}
