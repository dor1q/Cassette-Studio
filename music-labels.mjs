// Keep the service's stated record labels separate from release years, copyright
// holders, distributors and artist names. Those fields are not interchangeable.
export function normalizeRecordLabels(values) {
  const list = Array.isArray(values) ? values : [values], seen = new Set(), labels = [];
  for (const value of list.slice(0, 30)) {
    if (typeof value !== 'string') continue;
    const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    const key = name.toLocaleLowerCase('en');
    if (!name || /^\[?(?:no label|unknown|none|n\/a)\]?$/i.test(name) || seen.has(key)) continue;
    seen.add(key); labels.push(name);
  }
  return labels;
}

export function recordLabelMetadata(values, source = '') {
  const recordLabels = normalizeRecordLabels(values);
  return {recordLabels, recordLabelSource: recordLabels.length && typeof source === 'string' ? source.slice(0, 80) : ''};
}
