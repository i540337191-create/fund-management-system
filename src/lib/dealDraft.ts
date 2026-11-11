import type { DealTermsInput } from './dealTypes';
// Keep condition identities across retries; a lost response must not change the request body.
export function dealConditions(text: string, identities: Map<string,string>, newId: () => string): DealTermsInput['conditions'] {
  return text.split('\n').map(title => title.trim()).filter(Boolean).map(title => {
    let id = identities.get(title);
    if (!id) { id = newId(); identities.set(title,id); }
    return { id,title };
  });
}
