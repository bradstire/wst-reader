import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { TPL_01, TPL_02, TPL_03, TPL_04, TPL_05, TPL_06 } from './templates';
import { saveTextBlob, deleteOldFiles } from './storage';
import { applyBreaks } from './withBreaks';
import { headerize, timestampedName } from './postprocess';
import { getConfig } from './config';
import { sanitizeForOutput } from './sanitize';
import { drawSpread, drawClarifiers } from './spread';
import { redactUnrevealedCards } from './validator';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EXPECTED_VALIDATOR_HASH = 'af871599b2ecfad2230750512cb03a2805971a62';

function collectLinesWithPattern(text: string, pattern: RegExp): string[] {
  const lines = text.split('\n');
  const offenders: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (pattern.test(line)) {
      offenders.push(`[L${i + 1}] ${line.trim()}`);
    }
    pattern.lastIndex = 0;
  }
  return offenders;
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

const POST_FLIGHT_ENERGY_PATTERNS: Array<{
  pattern: RegExp;
  replace: (match: string) => string;
}> = [
  {
    pattern: /\bthe energy\b/gi,
    replace: (match) => adjustCase(match, 'the current'),
  },
  {
    pattern: /\bthis energy\b/gi,
    replace: (match) => adjustCase(match, 'this presence'),
  },
  {
    pattern: /\bthat energy\b/gi,
    replace: (match) => adjustCase(match, 'that pull'),
  },
  {
    pattern: /\bof energy\b/gi,
    replace: (match) => adjustCase(match, 'of force'),
  },
  {
    pattern: /\bin this energy\b/gi,
    replace: (match) => adjustCase(match, 'in this undertone'),
  },
  {
    pattern: /\bwith this energy\b/gi,
    replace: (match) => adjustCase(match, 'with this vibe'),
  },
  {
    pattern: /\benergy here\b/gi,
    replace: (match) => adjustCase(match, 'current here'),
  },
  {
    pattern: /\bthe energy's\b/gi,
    replace: (match) => adjustCase(match, "the current's"),
  },
  {
    pattern: /\bthis energy's\b/gi,
    replace: (match) => adjustCase(match, "this presence's"),
  },
];

const POST_FLIGHT_ENERGY_SYNONYMS = ['current', 'vibe', 'presence', 'pull', 'shift', 'undertone', 'tone', 'force', 'moment', 'card'];

const POST_FLIGHT_SIGNATURE_PATTERN = /\b(You knew[^.!?\n]{0,50}(?:before you said it|this already|that already)|Don['’]t lie to yourself)/gi;

const POST_FLIGHT_SIGNATURE_SOFT = ['You sensed this', 'You felt this already', 'You already clocked this', 'You knew it deep down'];

type SignatureMatch = {
  start: number;
  end: number;
  text: string;
};

function collectSignatureMatches(text: string): SignatureMatch[] {
  const regex = new RegExp(POST_FLIGHT_SIGNATURE_PATTERN.source, POST_FLIGHT_SIGNATURE_PATTERN.flags);
  const matches: SignatureMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return matches.sort((a, b) => a.start - b.start);
}

function buildSoftenedSignature(original: string, replacement: string): string {
  const trimmed = original.replace(/\s+$/u, '');
  const trailingWhitespace = original.slice(trimmed.length);
  const punctuationIndex = trimmed.search(/[—–\-,:;…]/);
  if (punctuationIndex >= 0) {
    const suffix = trimmed.slice(punctuationIndex);
    return `${replacement}${suffix}${trailingWhitespace}`;
  }
  return `${replacement}${trailingWhitespace}`;
}

function adjustCase(original: string, replacement: string): string {
  if (!original.length) return replacement;
  const first = original[0];
  if (first === first.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

type PostFlightMetrics = {
  text: string;
  energyBefore: number;
  energyAfter: number;
  signatureBefore: number;
  signatureAfter: number;
  fragmentsFixed: number;
  energyReplacements: number;
  signatureSoftened: number;
  commaFixes: number;
  nounSeamsCollapsed: number;
  genericEnergyFixes: string[];
};

export function enforcePostFlight(text: string): PostFlightMetrics {
  let output = text;
  const energyRegex = /\benergy\b/gi;
  const initialEnergy = countMatches(output, energyRegex);

  let energyCount = initialEnergy;
  let energyReplacements = 0;
  let synonymIndex = 0;
  const genericEnergyFixes: string[] = [];

  const applyEnergyPattern = (pattern: RegExp, replacer: (match: string) => string) => {
    let replaced = false;
    output = output.replace(pattern, (match) => {
      if (energyCount <= 10) {
        return match;
      }
      replaced = true;
      energyReplacements += 1;
      return replacer(match);
    });
    if (replaced) {
      energyCount = countMatches(output, energyRegex);
    }
    return replaced;
  };

  const GENERIC_ENERGY_PATTERNS: Array<{ pattern: RegExp; replacement: string; label: string }> = [
    { pattern: /\bthe energy\b/i, replacement: 'the current', label: 'the energy→the current' },
    { pattern: /\bthis energy\b/i, replacement: 'this shift', label: 'this energy→this shift' },
    { pattern: /\bthat energy\b/i, replacement: 'that vibe', label: 'that energy→that vibe' },
    { pattern: /\benergy here\b/i, replacement: 'current here', label: 'energy here→current here' },
    { pattern: /\benergy around you\b/i, replacement: 'tension around you', label: 'energy around you→tension around you' },
  ];

  const applyGenericEnergyReplacement = (): boolean => {
    for (const entry of GENERIC_ENERGY_PATTERNS) {
      if (entry.pattern.test(output)) {
        output = output.replace(entry.pattern, (match) => {
          energyReplacements += 1;
          genericEnergyFixes.push(entry.label);
          return adjustCase(match, entry.replacement);
        });
        energyCount = countMatches(output, energyRegex);
        return true;
      }
    }
    return false;
  };

  while (energyCount > 10) {
    let changed = false;
    for (const entry of POST_FLIGHT_ENERGY_PATTERNS) {
      const didChange = applyEnergyPattern(entry.pattern, entry.replace);
      changed = changed || didChange;
      if (energyCount <= 10) break;
    }
    if (energyCount <= 10) break;
    if (!changed) {
      const genericChanged = applyGenericEnergyReplacement();
      if (energyCount <= 10) break;
      if (genericChanged) {
        continue;
      }
      const before = energyCount;
      output = output.replace(energyRegex, (match) => {
        if (energyCount <= 10) {
          return match;
        }
        const synonym = POST_FLIGHT_ENERGY_SYNONYMS[synonymIndex % POST_FLIGHT_ENERGY_SYNONYMS.length];
        synonymIndex += 1;
        energyReplacements += 1;
        const replacement = adjustCase(match, synonym);
        return replacement;
      });
      energyCount = countMatches(output, energyRegex);
      if (energyCount === before) {
        break;
      }
    }
  }

  let finalEnergy = energyCount;

  const initialSignatureMatches = collectSignatureMatches(output);
  let signatureSoftened = 0;
  let softRotationIndex = 0;
  if (initialSignatureMatches.length > 3) {
    let matches = initialSignatureMatches;
    while (matches.length > 3) {
      const target = matches[3];
      const softVariant = POST_FLIGHT_SIGNATURE_SOFT[softRotationIndex % POST_FLIGHT_SIGNATURE_SOFT.length];
      softRotationIndex += 1;
      signatureSoftened += 1;
      const softened = buildSoftenedSignature(target.text, softVariant);
      output = `${output.slice(0, target.start)}${softened}${output.slice(target.end)}`;
      matches = collectSignatureMatches(output);
      if (softRotationIndex > 500) {
        break;
      }
    }
  }
  const finalSignatureMatches = collectSignatureMatches(output);
  const finalSignature = finalSignatureMatches.length;

  const massNouns = new Set(['chaos', 'stress', 'business', 'news', 'progress', 'mess']);
  let clausesNormalized = 0;
  output = output.replace(/(^|[\n.!?]\s*)there (?:also\s+)?(?:just\s+)?(?:saying|warning|forcing|buzzing|trying|about|not|waiting|here|screaming|showing)\b/gi, (match, prefix, offset, full) => {
    const matchStart = offset + prefix.length;
    const remainder = full.slice(matchStart + match.length - prefix.length);
    const nextWordMatch = remainder.match(/^(\s+)([A-Za-z]+)/);
    let pronoun = "It's";
    if (nextWordMatch) {
      const nextWord = nextWordMatch[2];
      const lower = nextWord.toLowerCase();
      if (/s$/.test(lower) && !massNouns.has(lower)) {
        pronoun = "They're";
      }
    }
    clausesNormalized += 1;
    const remainderOfMatch = match.slice(prefix.length + 'there'.length);
    return `${prefix}${pronoun}${remainderOfMatch}`;
  });

  let fragmentsFixed = 0;
  output = output.replace(/\bthere about\b/gi, (match) => {
    fragmentsFixed += 1;
    return adjustCase(match, "it's about");
  });
  output = output.replace(/\bthere a\b/gi, (match) => {
    fragmentsFixed += 1;
    return adjustCase(match, "there's a");
  });
  output = output.replace(/\bthere is\b/gi, (match) => {
    fragmentsFixed += 1;
    return adjustCase(match, "there's");
  });
  output = output.replace(/\bthere (trying|going|working|building|pushing|holding|calling|pressing|fighting|messing)\b/gi, (match, verb: string) => {
    fragmentsFixed += 1;
    return adjustCase(match, `they're ${verb}`);
  });
  output = output.replace(/\bthere not\b/gi, (match) => {
    fragmentsFixed += 1;
    return adjustCase(match, "they're not");
  });
  output = output.replace(/\bPart of there about\b/gi, () => {
    fragmentsFixed += 1;
    return 'Part of this is about';
  });
  output = output.replace(/\bthere\s+the\b/gi, (match) => {
    fragmentsFixed += 1;
    return adjustCase(match, "that's the");
  });
  output = output.replace(/\bthere like\b/gi, (match) => {
    fragmentsFixed += 1;
    return adjustCase(match, "it's like");
  });
  output = output.replace(/\bthere there\b/gi, (match) => {
    fragmentsFixed += 1;
    return adjustCase(match, "there's");
  });

  const pronounExclusions = new Set([
    'are','were','was','is','will','would','could','should','has','have','had','be','being','been','because','since','if','when','while','where','why','what','who','how','that','this','these','those','and','or','but','so','than','then','for','to','from','with','without','into','onto','over','under','about','around','through','between','behind','ahead','by','off','on','in','out','up','down','back'
  ]);
  output = output.replace(/\bthere\s+([a-z]+)\b/gi, (match, word) => {
    const lower = word.toLowerCase();
    if (pronounExclusions.has(lower)) {
      return match;
    }
    // Avoid double adjusting if we already handled specific patterns
    fragmentsFixed += 1;
    const plural = /s$/.test(lower) && !massNouns.has(lower);
    const pronoun = plural ? "they're" : "there's";
    const replacementPronoun = adjustCase(match, pronoun);
    const replacementWord = adjustCase(word, word);
    return `${replacementPronoun} ${replacementWord}`;
  });

  let nounCollapses = 0;
  output = output.replace(/\b(influence|vibe|current|presence)\s+(energy|current|vibe|presence)\b/gi, (_m, _first, second) => {
    nounCollapses += 1;
    return second;
  });
  output = output.replace(/\b(a|the|that|this)\s+(that|this)\b/gi, (_m, _first, second) => {
    nounCollapses += 1;
    return second;
  });
  output = output.replace(/\bthat little this\b/gi, () => {
    nounCollapses += 1;
    return 'that little';
  });
  output = output.replace(/\breversed (energy|influence|current|presence)\b/gi, (match) => {
    nounCollapses += 1;
    return match[0] === match[0].toUpperCase() ? 'Reversed card' : 'reversed card';
  });

  // (A) Comma splice fixers for subject,noun combinations followed by verbs
  let commaFixes = 0;
  const commaSubjectPattern = /(This|That|The|These|Those)\s+(influence|presence|vibe|current|pull|undercurrent|force|tone|card),\s+([a-z]+)/g;
  output = output.replace(commaSubjectPattern, (_match, subj, noun, verb) => {
    commaFixes += 1;
    return `${subj} ${noun} ${verb}`;
  });
  const commaSubjectLowerPattern = /(this|that|the|these|those)\s+(influence|presence|vibe|current|pull|undercurrent|force|tone|card),\s+([a-z]+)/g;
  output = output.replace(commaSubjectLowerPattern, (_match, subj, noun, verb) => {
    commaFixes += 1;
    return `${subj} ${noun} ${verb}`;
  });

  // (B) Additional noun seam collapsers
  let nounSeamFixes = 0;
  output = output.replace(/\b(influence|presence|vibe|current|pull|undercurrent|force|tone|card)\s+(beneath|under)\s+this\s+(influence|presence|vibe|current|pull|undercurrent|force|tone|card)\b/gi,
    (_match, first, prep) => {
      nounSeamFixes += 1;
      return `${first} ${prep} this`;
    });
  output = output.replace(/\b(this|that|these|those)\s+(influence|presence|vibe|current|pull|undercurrent|force|tone|card)\s+and\s+this\s+(influence|presence|vibe|current|pull|undercurrent|force|tone|card)\b/gi,
    (_match, determiner, firstNoun) => {
      nounSeamFixes += 1;
      return `${determiner} ${firstNoun}`;
    });
  output = output.replace(/\b(influence|presence|vibe|current|pull|undercurrent|force|tone|card)\s+(influence|presence|vibe|current|pull|undercurrent|force|tone|card)\b/gi,
    (match, _first, second) => {
      nounSeamFixes += 1;
      return adjustCase(match, second);
    });

  // (C) Reassert energy cap after adjustments
  energyCount = countMatches(output, energyRegex);
  if (energyCount > 10) {
    // Reset synonym rotation to keep replacements predictable
    synonymIndex = 0;
    while (energyCount > 10) {
      let changed = false;
      for (const entry of POST_FLIGHT_ENERGY_PATTERNS) {
        const didChange = applyEnergyPattern(entry.pattern, entry.replace);
        changed = changed || didChange;
        if (energyCount <= 10) break;
      }
      if (energyCount <= 10) break;
      if (!changed) {
        const genericChanged = applyGenericEnergyReplacement();
        if (energyCount <= 10) break;
        if (genericChanged) {
          continue;
        }
        const before = energyCount;
        output = output.replace(energyRegex, (match) => {
          if (energyCount <= 10) {
            return match;
          }
          const synonym = POST_FLIGHT_ENERGY_SYNONYMS[synonymIndex % POST_FLIGHT_ENERGY_SYNONYMS.length];
          synonymIndex += 1;
          energyReplacements += 1;
          return adjustCase(match, synonym);
        });
        energyCount = countMatches(output, energyRegex);
        if (energyCount === before) {
          break;
        }
      }
    }
  }
  finalEnergy = energyCount;
  const nounSeamsCollapsed = nounCollapses + nounSeamFixes;

  const fragmentCheckRegex = /\bthere\s+(?:also\s+)?(?:just\s+)?(saying|warning|forcing|buzzing|trying|about|not|waiting|here|screaming|showing|a|the)\b/i;
  const remainingFragments = fragmentCheckRegex.test(output);
  if (remainingFragments) {
    console.warn('[post-flight] WARN: residual "there" fragments detected after enforcement.');
  }

  console.log(
    `[post-flight] energy ${initialEnergy}→${finalEnergy} (replacements=${energyReplacements}), signature ${initialSignatureMatches.length}→${finalSignature} (softened=${signatureSoftened}), fragmentsFixed=${fragmentsFixed}, clausesNormalized=${clausesNormalized}, nounCollapses=${nounCollapses}, commaFixes=${commaFixes}, nounSeamsCollapsed=${nounSeamsCollapsed}, genericEnergyFixes=${genericEnergyFixes.length}`
  );

  return {
    text: output,
    energyBefore: initialEnergy,
    energyAfter: finalEnergy,
    signatureBefore: initialSignatureMatches.length,
    signatureAfter: finalSignature,
    fragmentsFixed,
    energyReplacements,
    signatureSoftened,
    commaFixes,
    nounSeamsCollapsed,
    genericEnergyFixes,
  };
}

export function computeValidatorHash(): string {
  const validatorPath = path.resolve(process.cwd(), 'lib', 'validator.ts');
  try {
    const quotedPath = JSON.stringify(validatorPath);
    const hash = execSync(`git hash-object ${quotedPath}`, {
      encoding: 'utf8',
    }).trim();
    if (hash) {
      return hash;
    }
  } catch (error) {
    console.warn('[generate] git hash-object failed, falling back to manual hash:', error);
  }

  try {
    const file = fs.readFileSync(validatorPath);
    const header = Buffer.from(`blob ${file.length}\0`);
    const sha1 = createHash('sha1');
    sha1.update(header);
    sha1.update(file);
    return sha1.digest('hex');
  } catch (error) {
    console.error('[generate] Failed to compute validator hash:', error);
    return 'unknown';
  }
}

async function genChapter(prompt: string, model = 'gpt-4.1-mini'): Promise<string> {
  const r = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are ANGELA for White Soul Tarot 2.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
  });
  return r.choices[0]?.message?.content || '';
}

export async function generateFullReading(sign: string) {
  console.log(`[generate] Starting full reading generation for ${sign}`);
  
  const validatorHash = computeValidatorHash();
  const allowDrift = process.env.ALLOW_VALIDATOR_DRIFT === 'true';
  if (!allowDrift && validatorHash !== EXPECTED_VALIDATOR_HASH) {
    const message = 'Validator drift detected — expected v5.3.0-stable hash. Aborting generation.';
    console.error(`[generate] ${message}`);
    throw new Error(message);
  }

  try {
    // Get config with date anchor
    const cfg = getConfig();
    cfg.sign = sign; // Override with provided sign
    
    // 0) Draw unique 5-card spread (cards can only appear once, regardless of orientation)
    const spread = drawSpread(cfg.reversal_ratio);
    const [c1, c2, c3, c4, c5] = spread;
    
    // Draw clarifiers (max 2, also unique)
    const usedCards = new Set(spread.map(card => card.replace(/, reversed$/i, '').trim()));
    const clarifierCards = drawClarifiers(usedCards, 2);
    const clarifiers = clarifierCards.length > 0 ? clarifierCards.join(' | ') : 'none';
    
    console.log(`[spread] Locked spread: ${spread.join(' | ')}`);
    console.log(`[spread] Clarifiers: ${clarifiers}`);
    
    // 1) Generate chapters (sequential to respect "locked spread" semantics)
    // CRITICAL: Implement linear narrative - each chapter only knows cards revealed so far
    console.log('[generate] Generating CH01...');
    const ch1Prompt = TPL_01
      .replaceAll('{sign}', sign)
      .replaceAll('{date_anchor}', cfg.date_anchor)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', '???') // Future cards hidden
      .replaceAll('{c3}', '???') // Future cards hidden
      .replaceAll('{c4}', '???') // Future cards hidden
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH01 gets clarifiers (revealed with Card 1)
      .replaceAll('{card1_line}', c1);
    let ch1 = await genChapter(ch1Prompt, cfg.openai_model);
    // Enforce linear narrative: only Card 01 allowed before any other reveals
    ({ text: ch1 } = redactUnrevealedCards(
      ch1,
      [c1, c2, c3, c4, c5],
      [c1],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH02...');
    const ch2Prompt = TPL_02
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', '???') // Future cards hidden
      .replaceAll('{c4}', '???') // Future cards hidden
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH02 gets clarifiers (already revealed)
      .replaceAll('{card2_line}', c2);
    let ch2 = await genChapter(ch2Prompt, cfg.openai_model);
    ({ text: ch2 } = redactUnrevealedCards(
      ch2,
      [c1, c2, c3, c4, c5],
      [c1, c2],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH03...');
    const ch3Prompt = TPL_03
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', '???') // Future cards hidden
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH03 gets clarifiers (already revealed)
      .replaceAll('{card3_line}', c3);
    let ch3 = await genChapter(ch3Prompt, cfg.openai_model);
    ({ text: ch3 } = redactUnrevealedCards(
      ch3,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH04...');
    const ch4Prompt = TPL_04
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', c4)
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH04 gets clarifiers (already revealed)
      .replaceAll('{card4_line}', c4);
    let ch4 = await genChapter(ch4Prompt, cfg.openai_model);
    ({ text: ch4 } = redactUnrevealedCards(
      ch4,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3, c4],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH05...');
    const ch5Prompt = TPL_05
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', c4)
      .replaceAll('{c5}', c5)
      .replaceAll('{clarifiers}', clarifiers) // CH05 gets clarifiers (already revealed)
      .replaceAll('{card5_line}', c5);
    let ch5 = await genChapter(ch5Prompt, cfg.openai_model);
    ({ text: ch5 } = redactUnrevealedCards(
      ch5,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3, c4, c5],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH06 (finale)...');
    const ch6Prompt = TPL_06
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', c4)
      .replaceAll('{c5}', c5)
      .replaceAll('{clarifiers}', clarifiers); // CH06 gets clarifiers (all revealed)
    let ch6 = await genChapter(ch6Prompt, cfg.openai_model);
    ({ text: ch6 } = redactUnrevealedCards(
      ch6,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3, c4, c5],
      clarifierCards
    ));

    // 2) Stitch
    console.log('[generate] Stitching chapters...');
    const stitchedRaw = [ch1, ch2, ch3, ch4, ch5, ch6].join('\n\n');

    // 3) Sanitize (remove debug logs)
    console.log('[generate] Sanitizing content...');
    const stitchedSanitized = sanitizeForOutput(stitchedRaw, { breaks: 'none' });
    const postFlight = enforcePostFlight(stitchedSanitized);
    const postFlightText = postFlight.text;

    if (postFlight.energyAfter > 10) {
      const energyLines = collectLinesWithPattern(postFlightText, /\benergy\b/i);
      console.warn(
        `[validator-assert] WARN: energy count ${postFlight.energyAfter} exceeds cap 10. Offending lines: ${energyLines.join(' || ')}`
      );
    }
    if (postFlight.signatureAfter > 3) {
      const signatureLines = collectLinesWithPattern(postFlightText, /\b(You knew[^.!?\n]{0,50}(?:before you said it|this already|that already)|Don't lie to yourself)/i);
      console.warn(
        `[validator-assert] WARN: signature count ${postFlight.signatureAfter} exceeds cap 3. Offending lines: ${signatureLines.join(' || ')}`
      );
    }

    // 4) Headerize (downstream)
    console.log('[generate] Adding header...');
    const banner = `[validator_hash=${validatorHash} | pass_order=card>contextual>fragments>redundant>noun-collision>plural>synonyms>safeguards | energy=${postFlight.energyBefore}→${postFlight.energyAfter} | signature=${postFlight.signatureBefore}→${postFlight.signatureAfter}]`;
    const stitchedWithBanner = `${banner}\n\n${postFlightText}`;
    const stitchedWithHeader = headerize(stitchedWithBanner, sign);

    // 5) Save stitched
    console.log('[generate] Saving stitched file...');
    const plainName = timestampedName('FULL_READING', sign);
    await saveTextBlob(plainName, stitchedWithHeader);

    // 6) Apply breaks (downstream)
    console.log('[generate] Applying break tags...');
    const withBreaks = applyBreaks(stitchedWithHeader);
    const breaksName = timestampedName('FULL_READING_with_breaks', sign);
    await saveTextBlob(breaksName, withBreaks);

    // 7) Clean up old files (keep only 5 most recent)
    console.log('[generate] Cleaning up old files...');
    await deleteOldFiles(`FULL_READING__${sign}__`, 5);
    await deleteOldFiles(`FULL_READING_with_breaks__${sign}__`, 5);

    console.log(`[generate] Generation complete: ${plainName}, ${breaksName}`);
    return { plainName, breaksName };
    
  } catch (error) {
    console.error('[generate] Error during generation:', error);
    throw error;
  }
}
