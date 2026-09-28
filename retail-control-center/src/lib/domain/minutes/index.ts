export * from './types';
export * from './detect';
export * from './templates';
export * from './render';

import { detectChanges, type DetectInput } from './detect';
import { getTemplate } from './templates';

/** Full deterministic pipeline: detection → structured data → template → editable doc. */
export function generateMinutes(input: DetectInput, templateId = 'standard') {
  const data = detectChanges(input);
  const doc = getTemplate(templateId).build(data);
  return { data, doc };
}
