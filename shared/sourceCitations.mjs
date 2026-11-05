const positiveInteger = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
const citationBodies = text => typeof text === 'string'
  ? [...text.matchAll(/\[([^\]]*)\]/g)].map(match => match[1].trim()).filter(body => /^S\d/i.test(body)) : [];

export function citationSourceNumbers(text) {
  return citationBodies(text).flatMap(body => [...body.matchAll(/(?:^|[,;]\s*)S(\d+)(?=\s*(?:[,;]|$))/gi)].map(match => Number(match[1])));
}

export function parseSourceCitations(text) {
  if (typeof text !== 'string') return [];
  const citations = [];
  const seen = new Set();
  const add = (source, location = null) => {
    const label = location ? `[S${source}, ${location.kind === 'slide' ? 'Slide' : 'Page'} ${location.number}]` : `[S${source}]`;
    if (!seen.has(label)) { seen.add(label); citations.push({ source, label, location }); }
  };
  for (const segment of citationBodies(text).flatMap(body => body.split(/[,;]\s*(?=S\d)/i))) {
    const match = /^S([1-9]\d*)(.*)$/i.exec(segment.trim());
    if (!match) continue;
    const [, sourceText, suffix = ''] = match;
    if (!positiveInteger(sourceText) || (suffix && !/^\s*,/.test(suffix))) continue;
    const source = Number(sourceText);
    const located = /^\s*,\s*(slides?|pages?)\s+(.+)\s*$/i.exec(suffix);
    if (!located) { add(source); continue; }
    const kind = /^slide/i.test(located[1]) ? 'slide' : 'page';
    const numbers = located[2].split(/\s*,\s*/);
    const valid = numbers.filter(positiveInteger);
    if (!valid.length) { add(source); continue; }
    for (const number of valid) add(source, { kind, number: Number(number) });
  }
  return citations;
}

export function normalizeSourceLocation(location) {
  return location && ['slide', 'page'].includes(location.kind) && positiveInteger(location.number)
    ? { kind: location.kind, number: Number(location.number) } : null;
}

export function sourceSections(content = '') {
  const text = typeof content === 'string' ? content : '';
  const headings = [...text.matchAll(/^(Slide|Page)\s+([1-9]\d*)[^\S\r\n]*(?:\r?\n|$)/gim)];
  if (!headings.length) return [{ text, kind: null, number: null }];
  const sections = headings[0].index ? [{ text: text.slice(0, headings[0].index), kind: null, number: null }] : [];
  headings.forEach((match, index) => sections.push({
    text: text.slice(match.index, headings[index + 1]?.index ?? text.length),
    kind: match[1].toLowerCase(), number: Number(match[2]),
  }));
  return sections;
}

export function citedSectionIndex(sections, location) {
  const target = normalizeSourceLocation(location);
  return target ? sections.findIndex(section => section.kind === target.kind && section.number === target.number) : -1;
}
