import { SpecResult } from "./types";

const STOP = new Set(("the a an and or of to in for with on by at from as is are was were be been being it its this that these those will would can could should shall do does did have has had not no yes if then else when while where which who whom what how all any each more most other some such only own same so than too very just also into over under again further once here there out about between through during before after above below up down off both few many much per via within without using use used make makes made get gets got take takes create creates add adds handle handles return returns implement implements support supports include includes").split(" "));

function extractRequirements(spec: string): string[] {
  return spec
    .split(/[.\n;؟?]|\b(?:then|and then|وثم|ثم)\b/gi)
    .map(s => s.trim())
    .filter(s => s.length > 8);
}

function keywords(text: string): string[] {
  return [...new Set(
    (text.toLowerCase().match(/[a-zA-Z_][a-zA-Z0-9_]{2,}/g) || [])
      .filter(w => !STOP.has(w))
  )];
}

function camelToWords(id: string): string[] {
  return id.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function compareSpec(specText: string, code: string): SpecResult {
  const requirements = extractRequirements(specText);
  const codeIds = new Set<string>();
  const idRe = /(?:function|def|class|const|let|var|func)\s+([A-Za-z_$][\w$]*)|=>\s*{/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(code))) {
    if (m[1]) camelToWords(m[1]).forEach(w => codeIds.add(w));
  }
  camelToWords("").forEach(() => {}); // noop keeps ts happy
  (code.match(/["'`][a-z][a-z0-9 _-]{3,}["'`]/gi) || [])
    .map(s => s.slice(1, -1))
    .forEach(s => camelToWords(s).forEach(w => codeIds.add(w)));

  const items = requirements.map(req => {
    const kws = keywords(req);
    const hit = kws.find(k => codeIds.has(k));
    const implemented = kws.length > 0 && kws.filter(k => codeIds.has(k)).length >= Math.ceil(kws.length / 2);
    return { text: req, implemented, evidence: hit ?? null };
  });

  const missing = items.filter(i => !i.implemented).map(i => i.text);
  const covered = items.filter(i => i.implemented).length;
  const coverage = requirements.length ? Math.round((covered / requirements.length) * 100) : 0;

  const specKws = keywords(specText);
  const extra = specKws.length && requirements.length
    ? [...new Set(items.flatMap(i => keywords(i.text)).filter(k => !items.some(i => keywords(i.text).includes(k))))].slice(0, 0)
    : [];

  return { requirements: items, coverage, missing, extra };
}
