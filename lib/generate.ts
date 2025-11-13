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
const STACCATO_SAFE_MODE = process.env.STACCATO_SAFE_MODE === '1';
const QUESTIONS_THROTTLE_FACTOR = (() => {
  const raw = process.env.QUESTIONS_THROTTLE_FACTOR;
  if (raw === undefined || raw === null || raw === '') {
    return 1;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
})();

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

const POST_FLIGHT_SIGNATURE_PATTERN = /\b(You knew[^.!?\n]{0,50}(?:before you said it|this already|that already)|Don[''']t lie to yourself)/gi;

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

function capitalizeFirst(text: string): string {
  if (!text.length) return text;
  return text[0].toUpperCase() + text.slice(1);
}

function isInsideTag(source: string, index: number): boolean {
  const lastOpen = source.lastIndexOf('<', index);
  const lastClose = source.lastIndexOf('>', index);
  if (lastOpen === -1) return false;
  if (lastClose === -1) return true;
  return lastOpen > lastClose;
}

function isCtaParagraph(paragraph: string): boolean {
  const lowered = paragraph.toLowerCase();
  return lowered.includes('please like') || lowered.includes("i'll see y'all soon") || lowered.includes('you already know what to do');
}

function collapseEllipses(text: string): string {
  return text
    .replace(/…{2,}/g, '…')
    .replace(/\.{4,}/g, '…')
    .replace(/\.{3}/g, '…')
    .replace(/…\.+/g, '…');
}

const MASS_NOUNS = new Set(['chaos', 'stress', 'business', 'news', 'progress', 'mess']);
const THERE_PRONOUN_EXCLUSIONS = new Set([
  'are','were','was','is','will','would','could','should','has','have','had','be','being','been','because','since','if','when','while','where','why','what','who','how','that','this','these','those','and','or','but','so','than','then','for','to','from','with','without','into','onto','over','under','about','around','through','between','behind','ahead','by','off','on','in','out','up','down','back'
]);

function enforceThereFragmentsPass(text: string): { text: string; fragmentsFixed: number; clausesNormalized: number } {
  let output = text;
  let fragmentsFixed = 0;
  let clausesNormalized = 0;
  output = output.replace(/(^|[\n.!?]\s*)there (?:also\s+)?(?:just\s+)?(?:saying|warning|forcing|buzzing|trying|about|not|waiting|here|screaming|showing)\b/gi, (match, prefix) => {
    const base = match.slice((prefix as string).length, (prefix as string).length + 'there'.length);
    const pronoun = adjustCase(base, "it's");
    const remainder = match.slice((prefix as string).length + 'there'.length);
    clausesNormalized += 1;
    return `${prefix as string}${pronoun}${remainder}`;
  });
  output = output.replace(/\bthere\s+([a-z]+)\b/gi, (match, word) => {
    const lower = word.toLowerCase();
    if (THERE_PRONOUN_EXCLUSIONS.has(lower)) {
      return match;
    }
    fragmentsFixed += 1;
    const plural = /s$/.test(lower) && !MASS_NOUNS.has(lower);
    const pronoun = plural ? "they're" : "there's";
    const replacementPronoun = adjustCase(match, pronoun);
    const replacementWord = adjustCase(word, word);
    return `${replacementPronoun} ${replacementWord}`;
  });
  return { text: output, fragmentsFixed, clausesNormalized };
}

const MINOR_RANKS = [
  'Ace','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Page','Knight','Queen','King'
];

const SUITS = ['Wands','Cups','Swords','Pentacles'];

const MAJOR_ARCANA = [
  'The Fool','The Magician','The High Priestess','The Empress','The Emperor','The Hierophant','The Lovers',
  'The Chariot','Strength','The Hermit','Wheel of Fortune','Justice','The Hanged Man','Death','Temperance',
  'The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World'
];

const CARD_NAME_REGEX = new RegExp(
  `(?:${MAJOR_ARCANA.map((name) => name.replace(/ /g, '\\s+')).join('|')}|(?:${MINOR_RANKS.join('|')})\\s+of\\s+(?:${SUITS.join('|')}))(?:,?\\s+reversed)?`,
  'gi'
);

const PIVOT_REACTIONS = ["Okay,", "Wait,", "Mm.", "Sheesh.", "Look—"];

const RITUAL_Q = [
  'What shifts when you sit with that?',
  'Where does this land in you?',
  'What does this ask of you now?',
  'How does this sit?',
  'What would honesty change here?'
];

const LETS_TEMPLATES = [
  "Let's name it.",
  "Let's pull one more.",
  "Let's be honest about what fell apart.",
  "Let's not overcomplicate this."
];

const AIR_SHORT_BEATS = [
  'You feel that shift.',
  'Hear the new current.',
  'This pause is loud.',
  'See the open door.',
  'Feel the air change.'
];

const AIR_LONG_BEATS = [
  'You keep mapping the possibilities, letting every voice in the room echo until one of them finally rings true.',
  'There is a moment where you watch every storyline fan out, deciding which one you can breathe inside without shrinking.',
  'You are still choosing how to speak this, looping the angles so the words land where they can actually move something.'
];

const AIR_CONNECTIVES = ['frankly', 'honestly', 'quietly', 'right now'];

const PERFORMABLE_OPENERS = [
  "Okay… so here's what I'm seeing.",
  "Let's not pretend you didn't feel that.",
  "Be honest—what changed after that call?"
];

const REVEAL_PAIR_SENTENCE = "Here's the part you don't want to say… You knew before you said it.";

const TAROT_ARC_QUESTIONS = [
  'What did this teach you?',
  "Where's the boundary?",
  'What has to change now?'
];

let lastOpenerUsed: string | null = null;

function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function computeStaccatoShare(lines: string[]): number {
  const total = lines.length;
  if (!total) return 0;
  const shortLines = lines.filter((line) => countWords(line) <= 6).length;
  return shortLines / total;
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n{2,}/u);
}

function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}

function pickRotating<T>(items: T[], index: { value: number }): T {
  const choice = items[index.value % items.length];
  index.value += 1;
  return choice;
}

function ensureTrailingPunctuation(sentence: string, fallback: string = '.'): string {
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}${fallback}`;
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
  ellipsesCount: number;
  questionCount: number;
  staccatoShare: number;
  letsCount: number;
  longLineFixes: number;
  airModWindows: number;
  anchorBeatsApplied: number;
  bannersRemoved: number;
  punctFixes: number;
};

export function enforcePostFlight(text: string, sign?: string): PostFlightMetrics {
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

  const enforceEnergyCap = () => {
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
  };

  enforceEnergyCap();

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
  let finalSignatureMatches = collectSignatureMatches(output);
  let finalSignature = finalSignatureMatches.length;

  const fragmentPassInitial = enforceThereFragmentsPass(output);
  output = fragmentPassInitial.text;
  let fragmentsFixed = fragmentPassInitial.fragmentsFixed;
  let clausesNormalized = fragmentPassInitial.clausesNormalized;

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
    synonymIndex = 0;
    enforceEnergyCap();
    energyCount = countMatches(output, energyRegex);
  }
  finalEnergy = energyCount;
  const nounSeamsCollapsed = nounCollapses + nounSeamFixes;

  const lowerSign = (sign || '').toLowerCase();
  const isAirSign = ['gemini', 'libra', 'aquarius'].includes(lowerSign);
  const isWaterAnchorSign = ['scorpio', 'pisces'].includes(lowerSign);
  const isCapricorn = lowerSign === 'capricorn';
  const isFireSign = ['aries', 'leo', 'sagittarius'].includes(lowerSign);
  const isWaterSign = ['cancer', 'scorpio', 'pisces'].includes(lowerSign);
  const isEarthSign = ['taurus', 'virgo', 'capricorn'].includes(lowerSign);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const questionUsage = new Map<string, number>();
  const ritualRotation = { value: 0 };
  let lastRitualQuestionUsed: string | null = null;
  let pivotReactionPointer = 0;
  let lastPivotReaction = '';
  let pivotReactionRotations = 0;
  const pickPivotReaction = () => {
    for (let attempt = 0; attempt < PIVOT_REACTIONS.length; attempt += 1) {
      const candidate = PIVOT_REACTIONS[pivotReactionPointer % PIVOT_REACTIONS.length];
      pivotReactionPointer += 1;
      if (candidate !== lastPivotReaction) {
        lastPivotReaction = candidate;
        pivotReactionRotations += 1;
        return candidate;
      }
    }
    const fallback = PIVOT_REACTIONS[0];
    lastPivotReaction = fallback;
    pivotReactionRotations += 1;
    return fallback;
  };
  const pickRitualQuestion = (wordOffset: number): string => {
    const length = RITUAL_Q.length;
    for (let attempt = 0; attempt < length * 2; attempt += 1) {
      const idx = (ritualRotation.value + attempt) % length;
      const candidate = RITUAL_Q[idx];
      const lastUse = questionUsage.get(candidate) ?? -Infinity;
      if (candidate === lastRitualQuestionUsed) continue;
      if (wordOffset - lastUse < 120) continue;
      ritualRotation.value = idx + 1;
      questionUsage.set(candidate, wordOffset);
      lastRitualQuestionUsed = candidate;
      return candidate;
    }
    const fallback = RITUAL_Q[ritualRotation.value % length];
    ritualRotation.value = ritualRotation.value + 1;
    questionUsage.set(fallback, wordOffset);
    lastRitualQuestionUsed = fallback;
    return fallback;
  };
  const injectedQuestionRecords: { question: string; priority: number }[] = [];
  let questionsAllowed = 0;
  let questionsInjected = 0;
  let questionSlotsRemaining = 0;
  const updatedWordCount = Math.max(countWords(output), 1);

  // (#6) Explicit card-name pivots
  const cardParagraphs = splitIntoParagraphs(output);
  const cardParagraphWordOffsets = cardParagraphs.map(() => 0);
  let cumulativeCardWords = 0;
  for (let i = 0; i < cardParagraphs.length; i += 1) {
    cardParagraphWordOffsets[i] = cumulativeCardWords;
    cumulativeCardWords += countWords(cardParagraphs[i]);
  }
  const enforcedCards = new Set<string>();
  for (let i = 0; i < cardParagraphs.length; i += 1) {
    const paragraph = cardParagraphs[i];
    if (!paragraph.trim()) continue;
    const matches = [...paragraph.matchAll(CARD_NAME_REGEX)];
    if (!matches.length) continue;
    const firstMatch = matches[0][0];
    const normalized = firstMatch.replace(/,?\s*reversed/gi, '').trim();
    const normalizedKey = normalized.toLowerCase();
    if (enforcedCards.has(normalizedKey)) {
      continue;
    }
    const trimmedParagraph = paragraph.trim();
    const leadingSentence = trimmedParagraph.split(/[.!?\n]/)[0]?.trim() || '';
    const alreadyHasHeader = leadingSentence.toLowerCase().startsWith('the ') && leadingSentence.toLowerCase().includes(normalizedKey);
    if (alreadyHasHeader) {
      enforcedCards.add(normalizedKey);
      continue;
    }
    const display = firstMatch.toLowerCase().includes('reversed') ? `${normalized} reversed` : normalized;
    const header = display.toLowerCase().startsWith('the ') ? display : `The ${display}`;
    const reaction = pickPivotReaction();
    const spacer = reaction.endsWith('—') ? '' : ' ';
    const wordOffset = cardParagraphWordOffsets[i];
    const reframe = pickRitualQuestion(wordOffset);
    const declarative = ensureTrailingPunctuation(`${reaction}${spacer}${header} is here showing you what this moment is about.`.replace(/\s+/g, ' ').trim());
    cardParagraphs[i] = `${declarative} ${reframe}\n${paragraph}`;
    questionsInjected += 1;
    injectedQuestionRecords.push({ question: reframe, priority: 0 });
    enforcedCards.add(normalizedKey);
  }
  output = joinParagraphs(cardParagraphs);

  // (#1) Ellipses as breath markers
  let ellipsesCount = countMatches(output, /…/g);
  const baseWordCount = Math.max(countWords(output), 1);
  const scaledPerK = Math.max(baseWordCount / 1000, 0.2);
  const minEllipses = Math.max(1, Math.round(5 * scaledPerK));
  const maxEllipses = Math.max(minEllipses, Math.round(10 * scaledPerK));
  const targetEllipses = Math.max(minEllipses, Math.min(Math.round(7.14 * scaledPerK), maxEllipses));
  let ellipsesNeeded = Math.max(0, Math.min(targetEllipses, maxEllipses) - ellipsesCount);
  const applyEllipsisPass = (regex: RegExp, handler: (...args: any[]) => string) => {
    if (ellipsesNeeded <= 0) return;
    const local = new RegExp(regex.source, regex.flags);
    output = output.replace(local, (...args) => {
      if (ellipsesNeeded <= 0) return args[0] as string;
      const current = args[0] as string;
      const str = args[args.length - 1] as string;
      const offset = (args[args.length - 2] as number) || 0;
      if (isInsideTag(str, offset)) return current;
      if (current.includes('…')) return current;
      const next = handler(...args);
      if (next === current) return current;
      ellipsesNeeded -= 1;
      ellipsesCount += 1;
      return next;
    });
  };
  if (ellipsesNeeded > 0) {
    applyEllipsisPass(/(^|[.!?])(\s*)(But|And|So|Okay|Look)\b/gm, (_match, punct = '', spaces = '', word: string) => {
      const gap = spaces || '';
      const cleanedPunct = punct.endsWith('…') ? punct : punct.replace(/\.+$/, '.');
      const adjustedWord = capitalizeFirst(word);
      return `${cleanedPunct}${gap}… ${adjustedWord}`;
    });
  }
  if (ellipsesNeeded > 0) {
    applyEllipsisPass(/(^|[.!?])(\s*)(I|You|We)\s+(admit|pretend|feel|know)\b/gi, (_match, punct = '', spaces = '', subject: string, verb: string) => {
      const gap = spaces || '';
      const cleanedPunct = punct.endsWith('…') ? punct : punct.replace(/\.+$/, '.');
      return `${cleanedPunct}${gap}… ${capitalizeFirst(subject)} ${verb}`;
    });
  }
  if (ellipsesNeeded > 0) {
    applyEllipsisPass(/(You knew before you said it)/g, (_match, _group, offset: number, str: string) => {
      if (isInsideTag(str, offset)) return _match;
      return '… You knew before you said it';
    });
  }
  output = collapseEllipses(output);
  ellipsesCount = countMatches(output, /…/g);

  // (#8) Reflective pivots
  let reflectiveTransforms = 0;
  output = output.replace(/\b(This|That) means ([^.?!\n]+)\./g, (match, _lead: string, rest: string) => {
    if (reflectiveTransforms >= 3) return match;
    reflectiveTransforms += 1;
    return `So maybe… this is what ${rest.trim()} looks like?`;
  });

  // (#2) Interrogative density
  const bodyWords = Math.max(countWords(output), 1);
  let baseTargetPerK = 7;
  if (isAirSign) baseTargetPerK = 8;
  else if (isFireSign) baseTargetPerK = 7;
  else if (isWaterSign) baseTargetPerK = 7;
  else if (isEarthSign) baseTargetPerK = 6;
  if (isCapricorn) baseTargetPerK = 6;
  let questionTarget = clamp(Math.round((bodyWords / 1000) * baseTargetPerK), 4, 10);
  const throttle = QUESTIONS_THROTTLE_FACTOR || 0.75;
  questionTarget = clamp(Math.round(questionTarget * throttle), 4, 10);
  questionTarget = clamp(questionTarget, 4, 10);
  questionsAllowed = questionTarget;
  const minWordsBetweenQuestions = isAirSign ? 100 : isFireSign ? 120 : isWaterSign ? 140 : isCapricorn ? 180 : 160;

  let questionCount = countMatches(output, /\?/g);
  const paragraphsForQuestions = splitIntoParagraphs(output);
  const paragraphWordOffsets = paragraphsForQuestions.reduce<number[]>((acc, paragraph, index) => {
    const previous = index === 0 ? 0 : acc[index - 1];
    acc.push(previous + countWords(paragraph));
    return acc;
  }, []);
  const paragraphHasQuestion = paragraphsForQuestions.map((paragraph) => (paragraph.match(/\?/g) || []).length);

  const arcQuestions = new Set<string>();
  TAROT_ARC_QUESTIONS.forEach((question) => {
    if (output.includes(question)) {
      arcQuestions.add(question.trim());
    }
  });

  const paragraphQuestionPriority: Array<'reserve_arc' | 'reserve_unique' | 'candidate'> = [];
  const questionOccurrences: Array<{ paragraphIndex: number; text: string; offset: number; priority: number }> = [];

  paragraphsForQuestions.forEach((paragraph, index) => {
    const matches = paragraph.match(/[^?]+\?/g);
    if (!matches) {
      paragraphQuestionPriority[index] = 'candidate';
      return;
    }
    const trimmedMatches = matches.map((question) => question.trim());
    const prioritized: Array<{ question: string; priority: number }> = trimmedMatches.map((question) => {
      if (arcQuestions.has(question)) return { question, priority: 0 };
      const trimmed = question.replace(/^[^A-Za-z]+/, '').replace(/\s+/g, ' ').trim();
      const isRitual = RITUAL_Q.some((entry) => entry === trimmed);
      const isUnique = trimmedMatches.length === 1 && isRitual;
      if (isUnique) return { question, priority: 1 };
      return { question, priority: 2 };
    });
    const highestPriority = Math.min(...prioritized.map((item) => item.priority));
    if (highestPriority === 0) paragraphQuestionPriority[index] = 'reserve_arc';
    else if (highestPriority === 1) paragraphQuestionPriority[index] = 'reserve_unique';
    else paragraphQuestionPriority[index] = 'candidate';

    let cumulativeOffset = paragraphWordOffsets[index] - countWords(paragraph);
    prioritized.forEach((item) => {
      cumulativeOffset += countWords(item.question);
      questionOccurrences.push({
        paragraphIndex: index,
        text: item.question,
        offset: cumulativeOffset,
        priority: item.priority,
      });
    });
  });

  const cooldownViolations = new Set<number>();
  questionOccurrences.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < questionOccurrences.length; i += 1) {
    const previous = questionOccurrences[i - 1];
    const current = questionOccurrences[i];
    if (current.offset - previous.offset < minWordsBetweenQuestions) {
      cooldownViolations.add(i);
    }
  }

  const questionTrimRecords: Array<{ paragraphIndex: number; text: string; replacement: string; priority: number }> = [];
  questionOccurrences.forEach((occurrence, index) => {
    const { paragraphIndex, text, priority } = occurrence;
    const paragraphPriority = paragraphQuestionPriority[paragraphIndex];
    if (paragraphPriority === 'reserve_arc' && arcQuestions.has(text)) return;
    if (paragraphPriority === 'reserve_unique' && priority <= 1) return;
    if (paragraphHasQuestion[paragraphIndex] > 1 && priority >= 2) {
      questionTrimRecords.push({ paragraphIndex, text, replacement: text.replace(/\?$/, '.').replace(/^What\b/i, 'Notice'), priority: priority + 1 });
      return;
    }
    if (cooldownViolations.has(index) && priority >= 2) {
      questionTrimRecords.push({ paragraphIndex, text, replacement: text.replace(/\?$/, '.').replace(/^What\b/i, 'Notice'), priority: priority + 2 });
      return;
    }
    questionTrimRecords.push({ paragraphIndex, text, replacement: text.replace(/\?$/, '.').replace(/^What\b/i, 'Notice'), priority });
  });

  questionTrimRecords.sort((a, b) => a.priority - b.priority);

  questionCount = countMatches(output, /\?/g);
  questionsInjected = questionOccurrences.length;
  let questionsTrimmed = 0;

  const keepers = new Set<string>();
  paragraphsForQuestions.forEach((paragraph, index) => {
    const matches = paragraph.match(/[^?]+\?/g);
    if (!matches || matches.length !== 1) return;
    const question = matches[0].trim();
    if (paragraphQuestionPriority[index] !== 'candidate') {
      keepers.add(question);
    }
  });

  let remainingQuestions = questionCount;
  questionsTrimmed = 0;
  for (const record of questionTrimRecords) {
    if (remainingQuestions <= questionTarget) break;
    if (record.priority <= 1) continue;
    if (keepers.has(record.text)) continue;
    const paragraph = paragraphsForQuestions[record.paragraphIndex];
    if (!paragraph.includes(record.text)) continue;
    const replacementBase = record.replacement.replace(/\?$/, '').trim();
    const replacement = replacementBase ? `${replacementBase.charAt(0).toUpperCase()}${replacementBase.slice(1)}.` : '';
    paragraphsForQuestions[record.paragraphIndex] = paragraph.replace(record.text, replacement);
    keepers.add(replacement);
    remainingQuestions -= 1;
    questionsTrimmed += 1;
  }

  output = joinParagraphs(paragraphsForQuestions);
  questionCount = countMatches(output, /\?/g);
  questionsInjected = Math.min(questionOccurrences.length, questionTarget);

  // (#3, #12) De-exclaim and closure softening
  const allowToneDown = process.env.ALLOW_CTA_TONE_DOWN !== 'false';
  const linesForExclaim = output.split('\n');
  let ctaExclaimFixes = 0;
  for (let i = 0; i < linesForExclaim.length; i += 1) {
    let line = linesForExclaim[i];
    if (!line.includes('!')) continue;
    const lowered = line.toLowerCase();
    const isCta = lowered.includes('please like') || lowered.includes("i'll see y'all soon") || lowered.includes('you already know what to do') || lowered.includes('if this hit');
    if (lowered.includes('you already know what to do!') && allowToneDown) {
      const matches = line.match(/You already know what to do!/gi);
      if (matches) ctaExclaimFixes += matches.length;
      line = line.replace(/You already know what to do!/gi, 'You already know what to do… right?');
    }
    if (lowered.includes("that's all i've got for now!")) {
      const matchesSmart = line.match(/That's all I've got for now!/gi);
      if (matchesSmart) ctaExclaimFixes += matchesSmart.length;
      const matchesAscii = line.match(/That's all I've got for now!/gi);
      if (matchesAscii) ctaExclaimFixes += matchesAscii.length;
      line = line.replace(/That's all I've got for now!/gi, "That's all for now… take it in.").replace(/That's all I've got for now!/gi, "That's all for now… take it in.");
    }
    if (isCta) {
      if (allowToneDown) {
        const hitMatches = line.match(/If this hit!…/gi);
        if (hitMatches) ctaExclaimFixes += hitMatches.length;
        line = line.replace(/If this hit!…/gi, 'If this hit…');
        const groupMatches = line.match(/tell your group chat!/gi);
        if (groupMatches) ctaExclaimFixes += groupMatches.length;
        line = line.replace(/tell your group chat!/gi, 'tell your group chat… right?');
        const pleaseMatches = line.match(/Please like, subscribe, tell your group chat!/gi);
        if (pleaseMatches) ctaExclaimFixes += pleaseMatches.length;
        line = line.replace(/Please like, subscribe, tell your group chat!/gi, 'Please like, subscribe, tell your group chat… right?');
        const seeMatches = line.match(/I'll see y'all soon!/gi);
        if (seeMatches) ctaExclaimFixes += seeMatches.length;
        const seeAsciiMatches = line.match(/I'll see y'all soon!/gi);
        if (seeAsciiMatches) ctaExclaimFixes += seeAsciiMatches.length;
        line = line.replace(/I'll see y'all soon!/gi, "I'll see y'all soon.").replace(/I'll see y'all soon!/gi, "I'll see y'all soon.");
      }
      const trailMatches = line.match(/!…/g);
      if (trailMatches) ctaExclaimFixes += trailMatches.length;
      line = line.replace(/!…/g, '… right?…');
      linesForExclaim[i] = line;
      continue;
    }
    const encouragementRegex = /(you can|you deserve|keep|stay|breathe|take|remember|please|let[''']s|you already|we can|trust|lean|believe)/i;
    const warningRegex = /(don't|stop|never|warning|avoid|danger)/i;
    if (encouragementRegex.test(line) && !warningRegex.test(line)) {
      line = line.replace(/!+/g, '… right?');
    } else {
      line = line.replace(/!+/g, '.');
    }
    const trailMatches = line.match(/!…/g);
    if (trailMatches) ctaExclaimFixes += trailMatches.length;
    line = line.replace(/!…/g, '… right?…');
    linesForExclaim[i] = line;
  }
  output = linesForExclaim.join('\n');

  // (#16) Performable opener enforcement
  const openerLines = output.split('\n');
  const firstContentIndex = openerLines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex >= 0) {
    const existing = openerLines[firstContentIndex].trim();
    const hasOpener = PERFORMABLE_OPENERS.some((entry) => entry.toLowerCase() === existing.toLowerCase());
    if (!hasOpener) {
      const candidates = PERFORMABLE_OPENERS.filter((candidate) => candidate !== lastOpenerUsed);
      const chosen = candidates.length ? candidates[0] : PERFORMABLE_OPENERS[0];
      openerLines.splice(firstContentIndex, 0, chosen);
      lastOpenerUsed = chosen;
    } else {
      lastOpenerUsed = existing;
    }
  }
  output = openerLines.join('\n');

  // (#4) Inclusive "let's" invitations
  let letsCount = countMatches(output, /\bLet[''']s\b/gi);
  const letsTargetBase = Math.round(Math.max(updatedWordCount / 1000, 0.75) * 4);
  const letsTarget = Math.max(3, Math.min(5, letsTargetBase));
  if (letsCount < letsTarget) {
    const letsRotation = { value: 0 };
    let paragraphsForLets = splitIntoParagraphs(output);
    const reflectiveRegex = /\b(truth|maybe|afraid|tired|stuck|heavy|boundary|choice|feel)\b/i;
    let lastInsertedIndex = -10;
    for (let i = 0; i < paragraphsForLets.length && letsCount < letsTarget; i += 1) {
      const paragraph = paragraphsForLets[i];
      if (!paragraph.trim()) continue;
      if (!reflectiveRegex.test(paragraph)) continue;
      if (Math.abs(i - lastInsertedIndex) <= 1) continue;
      const prompt = pickRotating(LETS_TEMPLATES, letsRotation);
      paragraphsForLets[i] = `${ensureTrailingPunctuation(paragraph.trim())} ${prompt}`;
      letsCount += 1;
      lastInsertedIndex = i;
    }
    let idx = 0;
    while (letsCount < 3 && idx < paragraphsForLets.length) {
      const paragraph = paragraphsForLets[idx];
      if (paragraph && Math.abs(idx - lastInsertedIndex) > 1) {
        const prompt = pickRotating(LETS_TEMPLATES, letsRotation);
        paragraphsForLets[idx] = `${ensureTrailingPunctuation(paragraph.trim())} ${prompt}`;
        letsCount += 1;
        lastInsertedIndex = idx;
      }
      idx += 1;
    }
    output = joinParagraphs(paragraphsForLets);
  }

  // (#7) Controlled disfluency
  const fillerTemplates = ['Okay…', 'So…', 'Look,', 'Uh—', 'Wait.'];
  const fillerRotation = { value: 0 };
  const fillerTarget = Math.max(1, Math.round(Math.max(updatedWordCount / 500, 0.8)));
  let fillerCount = 0;
  let paragraphsForFillers = splitIntoParagraphs(output);
  const intensityRegex = /\b(stuck|afraid|pressure|heavy|tense|exhausted|raw|overwhelmed|brutal|sharp)\b/i;
  for (let i = 0; i < paragraphsForFillers.length && fillerCount < fillerTarget; i += 1) {
    const paragraph = paragraphsForFillers[i];
    if (!paragraph.trim()) continue;
    if (!intensityRegex.test(paragraph)) continue;
    if (/^(Okay|So|Look|Uh|Wait)/i.test(paragraph.trim())) continue;
    const filler = pickRotating(fillerTemplates, fillerRotation);
    paragraphsForFillers[i] = `${filler} ${paragraph.trim()}`;
    fillerCount += 1;
  }
  output = joinParagraphs(paragraphsForFillers);

  // (#5) Staccato rebalancer
  let linesForStaccato = output.split('\n');
  let staccatoShare = computeStaccatoShare(linesForStaccato);
  const staccatoBefore = staccatoShare;
  const staccatoTargetMax = isAirSign ? 0.25 : isEarthSign ? 0.18 : (isFireSign || isWaterSign) ? 0.23 : 0.20;
  let mergesApplied = 0;
  let fillerClustersTrimmed = 0;
  let standaloneMerged = 0;
  let windowsAdjusted = 0;
  let airShortBeatsInlined = 0;

  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, ' ').trim();
  const cleanupMerge = (text: string) => text.replace(/\s+([,;:.!?])/g, '$1').replace(/\s+—/g, ' —').replace(/—\s+/g, ' — ');
  const isProtectedLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    const lowered = trimmed.toLowerCase();
    if (trimmed.startsWith('The ') && trimmed.includes('is here showing you what this moment is about.')) return true;
    if (trimmed === REVEAL_PAIR_SENTENCE.trim() || trimmed.startsWith("Here's the part you don't want to say…")) return true;
    if (TAROT_ARC_QUESTIONS.some((question) => question === trimmed)) return true;
    if (lowered.includes('please like') || lowered.includes("i'll see y'all soon") || lowered.includes('if this hit') || lowered.includes('you already know what to do') || lowered.includes("that's all for now")) return true;
    return false;
  };

  const mergeIntoNext = (index: number, connector = ' — '): boolean => {
    if (index < 0 || index >= linesForStaccato.length - 1) return false;
    const current = linesForStaccato[index];
    const next = linesForStaccato[index + 1];
    if (isProtectedLine(current) || isProtectedLine(next)) return false;
    const left = normalizeWhitespace(current).replace(/[—-]\s*$/, '').trim();
    const right = normalizeWhitespace(next);
    if (!left || !right) return false;
    let merged = `${left}${connector}${right}`;
    merged = cleanupMerge(merged);
    linesForStaccato[index] = merged;
    linesForStaccato.splice(index + 1, 1);
    mergesApplied += 1;
    return true;
  };

  const mergeIntoPrevious = (index: number, connector = ' — '): boolean => {
    if (index <= 0 || index >= linesForStaccato.length) return false;
    const prevLine = linesForStaccato[index - 1];
    const current = linesForStaccato[index];
    if (isProtectedLine(prevLine) || isProtectedLine(current)) return false;
    const left = normalizeWhitespace(prevLine).replace(/[—-]\s*$/, '').trim();
    const right = normalizeWhitespace(current);
    if (!left || !right) return false;
    let merged = `${left}${connector}${right}`;
    merged = cleanupMerge(merged);
    linesForStaccato[index - 1] = merged;
    linesForStaccato.splice(index, 1);
    mergesApplied += 1;
    return true;
  };

  const STANDALONE_SHORT_RX = /^(Okay|So|Look|Wait|Uh|Mm|Yeah|Anyway)([,.… —])*$/i;
  const toTokenCount = (line: string) => {
    const trimmed = line.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };
  const isStandaloneShort = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (toTokenCount(trimmed) > 6) return false;
    return STANDALONE_SHORT_RX.test(trimmed);
  };

  const buildClusterLead = (cluster: string[]): string => {
    if (!cluster.length) return '';
    const parts: string[] = [];
    cluster.forEach((rawLine, idx) => {
      const trimmed = rawLine.trim();
      const base = trimmed
        .replace(/^…\s*/, '')
        .replace(/[\s,.;!?…—-]+$/g, '')
        .trim();
      if (!base) return;
      if (idx === 0) {
        const lead = capitalizeFirst(base);
        parts.push(`${lead}…`);
      } else {
        parts.push(`${base.toLowerCase()}—`);
      }
    });
    if (!parts.length) {
      const fallback = cluster[0].trim();
      return fallback.endsWith('…') ? fallback : `${fallback}…`;
    }
    return parts.join(' ').replace(/—+$/, '—');
  };

  const chooseConnector = (shortLine: string, nextLine: string): string => {
    const shortTrim = shortLine.trim();
    const nextTrim = nextLine.trim();
    const shortHasPause = /(…|—|-)$/.test(shortTrim);
    const nextStartsLower = /^[a-z]/.test(nextTrim);
    if (shortHasPause) return ' … ';
    if (nextStartsLower) return ' … ';
    return ' — ';
  };

  const mergeStandaloneShorts = () => {
    let index = 0;
    while (index < linesForStaccato.length) {
      const line = linesForStaccato[index];
      if (!isStandaloneShort(line) || isProtectedLine(line)) {
        index += 1;
        continue;
      }

      const cluster: string[] = [];
      let cursor = index;
      while (cursor < linesForStaccato.length && isStandaloneShort(linesForStaccato[cursor]) && !isProtectedLine(linesForStaccato[cursor])) {
        cluster.push(linesForStaccato[cursor]);
        cursor += 1;
      }

      const nextIndex = cursor;
      if (nextIndex >= linesForStaccato.length) {
        index = nextIndex;
        continue;
      }

      const nextLine = linesForStaccato[nextIndex];
      if (!nextLine.trim() || isProtectedLine(nextLine)) {
        index = nextIndex;
        continue;
      }

      const clusterLead = buildClusterLead(cluster);
      const nextNormalized = normalizeWhitespace(nextLine);

      let mergedLine: string;
      if (cluster.length === 1) {
        const connector = chooseConnector(cluster[0], nextLine);
        let shortSegment = normalizeWhitespace(cluster[0]).replace(/\s+$/, '');
        if (connector === ' … ') {
          shortSegment = shortSegment.replace(/[.!?…]+$/g, '…');
          if (!shortSegment.endsWith('…')) shortSegment += '…';
        } else {
          shortSegment = shortSegment.replace(/[.!?…]+$/g, '');
        }
        if (!shortSegment) {
          shortSegment = clusterLead || normalizeWhitespace(cluster[0]);
        }
        mergedLine = cleanupMerge(`${shortSegment}${connector}${nextNormalized}`);
      } else {
        const normalizedLead = clusterLead.endsWith('—') ? clusterLead : `${clusterLead}—`;
        mergedLine = cleanupMerge(`${normalizedLead} ${nextNormalized}`);
      }

      linesForStaccato.splice(index, cluster.length + 1, mergedLine);
      standaloneMerged += cluster.length;
      if (cluster.length > 1) fillerClustersTrimmed += cluster.length - 1;
      mergesApplied += 1;
    }
  };

  let lineWordCounts: number[] = [];
  let shortLineFlags: boolean[] = [];
  let totalShortLines = 0;

  const recomputeMetrics = () => {
    lineWordCounts = linesForStaccato.map((line) => countWords(line));
    shortLineFlags = lineWordCounts.map((count) => count > 0 && count <= 6);
    totalShortLines = shortLineFlags.filter(Boolean).length;
    staccatoShare = computeStaccatoShare(linesForStaccato);
  };

  recomputeMetrics();

  const computeWindows = () => {
    const windows: Array<{ start: number; end: number; share: number; candidates: number[] }> = [];
    let start = 0;
    while (start < linesForStaccato.length) {
      let end = start;
      let words = 0;
      let shortCount = 0;
      const shortIndices: number[] = [];
      while (end < linesForStaccato.length && words + lineWordCounts[end] <= 200) {
        words += lineWordCounts[end];
        if (shortLineFlags[end]) {
          shortCount += 1;
          shortIndices.push(end);
        }
        end += 1;
      }
      if (words > 0 && end > start) {
        windows.push({ start, end, share: shortCount / (end - start), candidates: shortIndices });
      }
      start = end > start ? end : start + 1;
    }
    return windows;
  };

  mergeStandaloneShorts();

  const shortFillersInline = () => {
    const SHORT_FILLER_RX = /^(Okay|Yeah|Mm|Sheesh|Wait|Anyway|Look)([ ,.…—-]*)$/i;
    let i = 0;
    while (i < linesForStaccato.length) {
      const line = linesForStaccato[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }
      if (!SHORT_FILLER_RX.test(line.trim()) || countWords(line) > 6 || isProtectedLine(line)) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < linesForStaccato.length && SHORT_FILLER_RX.test(linesForStaccato[j + 1].trim()) && !isProtectedLine(linesForStaccato[j + 1])) {
        linesForStaccato.splice(j, 1);
        mergesApplied += 1;
        fillerClustersTrimmed += 1;
      }
      if (i >= linesForStaccato.length - 1) {
        i += 1;
        continue;
      }
      const nextLine = linesForStaccato[i + 1];
      if (!nextLine.trim() || isProtectedLine(nextLine)) {
        i += 1;
        continue;
      }
      const nextStartsSoft = /^(So|And|But|Okay|Look)/i.test(nextLine.trim());
      const connector = nextStartsSoft ? ' … ' : ' — ';
      const merged = cleanupMerge(`${line.trim().replace(/[ ,.…—-]+$/, '')}${connector}${normalizeWhitespace(nextLine)}`);
      linesForStaccato[i] = merged;
      linesForStaccato.splice(i + 1, 1);
      mergesApplied += 1;
      i += 1;
    }
  };

  const enforceWindowCap = (): boolean => {
    const windows = computeWindows();
    for (const window of windows) {
      const target = isAirSign ? 0.25 : isEarthSign ? 0.18 : (isFireSign || isWaterSign) ? 0.23 : 0.20;
      if (window.share <= target) continue;
      const candidates = window.candidates
        .filter((idx) => lineWordCounts[idx] <= 6 && !isProtectedLine(linesForStaccato[idx]))
        .sort((a, b) => lineWordCounts[a] - lineWordCounts[b]);
      if (!candidates.length) continue;
      for (const idx of candidates) {
        if (lineWordCounts[idx] <= 4 && mergeIntoNext(idx)) {
          recomputeMetrics();
          windowsAdjusted += 1;
          return true;
        }
      }
      for (const idx of candidates) {
        if (lineWordCounts[idx] <= 4 && mergeIntoPrevious(idx)) {
          recomputeMetrics();
          windowsAdjusted += 1;
          return true;
        }
      }
      for (const idx of candidates) {
        if (mergeIntoNext(idx) || mergeIntoPrevious(idx)) {
          recomputeMetrics();
          windowsAdjusted += 1;
          return true;
        }
      }
    }
    return false;
  };

  shortFillersInline();
  recomputeMetrics();
  while (!STACCATO_SAFE_MODE && enforceWindowCap()) {
    recomputeMetrics();
  }

  if (STACCATO_SAFE_MODE && staccatoShare > staccatoTargetMax) {
    console.log('[post-flight] STACCATO_SAFE_MODE=1 active — window merges skipped.');
  }

  const maxShortLines = Math.floor(staccatoTargetMax * linesForStaccato.length);
  if (!STACCATO_SAFE_MODE && totalShortLines > maxShortLines) {
    for (let index = linesForStaccato.length - 1; index >= 0 && totalShortLines > maxShortLines; index -= 1) {
      if (!shortLineFlags[index] || isProtectedLine(linesForStaccato[index])) continue;
      const merged = mergeIntoPrevious(index) || mergeIntoNext(index);
      if (!merged) continue;
      recomputeMetrics();
      index = Math.min(index, linesForStaccato.length - 1);
    }
  } else if (STACCATO_SAFE_MODE && totalShortLines > maxShortLines) {
    console.log('[post-flight] STACCATO_SAFE_MODE=1 active — short-line ceiling merge skipped.');
  }

  staccatoShare = computeStaccatoShare(linesForStaccato);
  const staccatoAfter = staccatoShare;
  output = linesForStaccato.join('\n');

  const hygiene = stripDuplicateBanners(output);
  output = hygiene.text;
  let punctFixes = 0;
  output = output.split('\n').map((line) => {
    let updated = line.replace(/\?\?/g, '?');
    if (updated !== line) punctFixes += 1;
    const replacedQuestionPeriod = updated.replace(/\?\./g, '?');
    if (replacedQuestionPeriod !== updated) punctFixes += 1;
    updated = replacedQuestionPeriod;
    const ellipsisReduced = updated.replace(/\.{3,}/g, '…');
    if (ellipsisReduced !== updated) punctFixes += 1;
    updated = ellipsisReduced;
    const doublePeriodNormalized = updated.replace(/([^\.])\.\./g, '$1.');
    if (doublePeriodNormalized !== updated) punctFixes += 1;
    updated = doublePeriodNormalized;
    const dashSpacingNormalized = updated.replace(/\s*—\s*/g, ' — ');
    if (dashSpacingNormalized !== updated) punctFixes += 1;
    updated = dashSpacingNormalized;
    const ellipsisSpacingNormalized = updated.replace(/\s*…\s*/g, ' … ');
    if (ellipsisSpacingNormalized !== updated) punctFixes += 1;
    updated = ellipsisSpacingNormalized;
    return updated.replace(/\s{2,}/g, ' ').trimEnd();
  }).join('\n');

  // (#10) Anchor cadence for Scorpio & Pisces
  let anchorBeatsApplied = 0;
  if (isWaterAnchorSign) {
    const anchorParagraphs = splitIntoParagraphs(output);
    const totalWords = anchorParagraphs.reduce((sum, paragraph) => sum + countWords(paragraph), 0);
    const threshold = totalWords * 0.8;
    let cumulative = 0;
    let anchorIndex = anchorParagraphs.length - 1;
    for (let i = 0; i < anchorParagraphs.length; i += 1) {
      cumulative += countWords(anchorParagraphs[i]);
      if (cumulative >= threshold) {
        anchorIndex = i;
        break;
      }
    }
    const anchorLines = [
      'Here it is—the truth you were trying not to dodge.',
      'Breathe. One beat.',
      'Stay with it and move slowly.'
    ];
    if (!anchorParagraphs.slice(anchorIndex, anchorIndex + 3).includes(anchorLines[0])) {
      anchorParagraphs.splice(anchorIndex, 0, ...anchorLines);
      anchorBeatsApplied = 1;
      output = joinParagraphs(anchorParagraphs);
    }
  }

  // (#9 & #18) Air-sign modulation
  let airModWindows = 0;
  if (isAirSign) {
    const windowSize = 200;
    const paragraphsAir = splitIntoParagraphs(output);
    const wordsPerParagraph = paragraphsAir.map((paragraph) => countWords(paragraph));
    const shortRotation = { value: 0 };
    const longRotation = { value: 0 };
    const connectiveRotation = { value: 0 };
    let cumulative = 0;
    const windowsHandled = new Set<number>();
    for (let i = 0; i < paragraphsAir.length; i += 1) {
      const windowIndex = Math.floor(cumulative / windowSize);
      cumulative += wordsPerParagraph[i];
      if (windowsHandled.has(windowIndex)) continue;
      const paragraph = paragraphsAir[i];
      if (!paragraph || paragraph.includes('<')) continue;
      const alreadyHasBeat = /You feel that shift\.|Hear the new current\.|This pause is loud\.|See the open door\.|Feel the air change\./.test(paragraph);
      if (alreadyHasBeat || wordsPerParagraph[i] === 0) continue;
      const shortBeat = pickRotating(AIR_SHORT_BEATS, shortRotation);
      const longBeatBase = pickRotating(AIR_LONG_BEATS, longRotation);
      const connective = pickRotating(AIR_CONNECTIVES, connectiveRotation);
      const longBeat = `${capitalizeFirst(connective)}, ${longBeatBase.charAt(0).toLowerCase() + longBeatBase.slice(1)}`;
      const wordOffset = cumulative - wordsPerParagraph[i];
      let questionLine = '';
      if (questionSlotsRemaining > 0) {
        const extraQuestion = pickRitualQuestion(wordOffset);
        questionLine = extraQuestion;
        questionCount += 1;
        questionsInjected += 1;
        injectedQuestionRecords.push({ question: extraQuestion, priority: 2 });
        questionSlotsRemaining = Math.max(questionTarget - questionCount, 0);
      }
      const shortTrim = shortBeat.trim();
      const shortBase = shortTrim.replace(/[.!?…]+$/g, '');
      let inlineShort = capitalizeFirst(shortBase);
      if (!inlineShort.endsWith('…')) inlineShort = `${inlineShort}…`;
      const longStartsLower = /^[a-z]/.test(longBeat.trim());
      const shortHasEllipsis = /…$/.test(shortTrim);
      const inlineConnector = shortHasEllipsis ? ' … ' : longStartsLower ? ' … ' : ' — ';
      let inlineIntro = cleanupMerge(`${inlineShort}${inlineConnector}${longBeat}`);
      if (questionLine) {
        inlineIntro = cleanupMerge(`${inlineIntro} ${questionLine}`);
      }
      const paragraphBody = normalizeWhitespace(paragraph);
      const combinedParagraph = paragraphBody
        ? cleanupMerge(`${inlineIntro} ${paragraphBody}`)
        : inlineIntro;
      paragraphsAir[i] = combinedParagraph;
      airShortBeatsInlined += 1;
      airModWindows += 1;
      windowsHandled.add(windowIndex);
    }
    output = joinParagraphs(paragraphsAir);
  }

  // (#13) Reveal cadence pair
  const revealTarget = Math.max(1, Math.round(Math.max(countWords(output) / 1000, 0.75)));
  let revealCount = countMatches(output, /Here's the part you don't want to say…/g);
  if (revealCount < revealTarget) {
    const revealParagraphs = splitIntoParagraphs(output);
    const insertIndex = Math.min(revealParagraphs.length, Math.max(1, Math.floor(revealParagraphs.length * 0.6)));
    revealParagraphs.splice(insertIndex, 0, REVEAL_PAIR_SENTENCE);
    output = joinParagraphs(revealParagraphs);
    revealCount += 1;
  }

  // (#14) Tarot arc checkpoint questions
  const arcParagraphs = splitIntoParagraphs(output);
  if (!TAROT_ARC_QUESTIONS.every((question) => arcParagraphs.some((paragraph) => paragraph.trim() === question))) {
    const totalParagraphs = arcParagraphs.length || 1;
    const stageIndexes = [
      Math.max(1, Math.floor(totalParagraphs * 0.25)),
      Math.max(1, Math.floor(totalParagraphs * 0.5)),
      Math.max(1, Math.floor(totalParagraphs * 0.75))
    ];
    for (let i = 0; i < TAROT_ARC_QUESTIONS.length; i += 1) {
      const question = TAROT_ARC_QUESTIONS[i];
      if (arcParagraphs.some((paragraph) => paragraph.trim() === question)) continue;
      const insertAt = Math.min(stageIndexes[i] || totalParagraphs, arcParagraphs.length);
      arcParagraphs.splice(insertAt, 0, question);
      questionCount += 1;
    }
    output = joinParagraphs(arcParagraphs);
  }
  if (questionCount > questionTarget && injectedQuestionRecords.length) {
    const paragraphsTrim = splitIntoParagraphs(output);
    const sortedRecords = [...injectedQuestionRecords].sort((a, b) => a.priority - b.priority);
    for (const record of sortedRecords) {
      if (questionCount <= questionTarget) break;
      const escaped = escapeRegExp(record.question.trim());
      const standaloneRegex = new RegExp(`^\s*${escaped}\s*$`);
      const trailingRegex = new RegExp(`\s*${escaped}[.!?…]*$`);
      for (let i = 0; i < paragraphsTrim.length && questionCount > questionTarget; i += 1) {
        if (!paragraphsTrim[i].includes(record.question)) continue;
        let updated = paragraphsTrim[i];
        if (standaloneRegex.test(updated)) {
          updated = '';
        } else if (trailingRegex.test(updated)) {
          updated = updated.replace(trailingRegex, '').trimEnd();
        } else {
          continue;
        }
        if (updated !== paragraphsTrim[i]) {
          paragraphsTrim[i] = updated;
          questionCount -= 1;
          questionsTrimmed += 1;
          break;
        }
      }
    }
    output = joinParagraphs(paragraphsTrim);
    questionCount = countMatches(output, /\?/g);
  }

  // (#15) Long-line guard (>28 words sans punctuation)
  let longLineFixes = 0;
  let linesForGuard = output.split('\n');
  for (let i = 0; i < linesForGuard.length; i += 1) {
    const line = linesForGuard[i];
    if (line.includes('<') || line.includes('http') || line.includes('://') || /\d{1,2}:\d{2}/.test(line)) {
      continue;
    }
    if (countWords(line) > 28 && !/[.,;:!?—…]/.test(line)) {
      const delimiters = [', and ', ', but ', ' — ', ' … '];
      let first = '';
      let second = '';
      let splitFound = false;
      for (const delimiter of delimiters) {
        const idx = line.indexOf(delimiter);
        if (idx > 0) {
          first = line.slice(0, idx).trim();
          second = line.slice(idx + delimiter.length).trim();
          if (first && second) {
            splitFound = true;
            break;
          }
        }
      }
      if (!splitFound) {
        const words = line.trim().split(/\s+/);
        const mid = Math.floor(words.length / 2);
        first = `${words.slice(0, mid).join(' ')} —`.trim();
        second = capitalizeFirst(words.slice(mid).join(' ').trim());
        linesForGuard.splice(i, 1, ensureTrailingPunctuation(first, '.'), ensureTrailingPunctuation(capitalizeFirst(second)));
      } else {
        linesForGuard.splice(i, 1, ensureTrailingPunctuation(first), ensureTrailingPunctuation(capitalizeFirst(second)));
      }
      longLineFixes += 1;
      i += 1;
    }
  }
  output = linesForGuard.join('\n');
  output = collapseEllipses(output);

  // (#11) Capricorn energy zeroing
  if (isCapricorn) {
    const capSynonyms = ['current', 'presence', 'pull', 'momentum', 'tone'];
    let capIndex = 0;
    output = output.replace(/\benergy\b/gi, (match) => {
      const synonym = capSynonyms[capIndex % capSynonyms.length];
      capIndex += 1;
      return adjustCase(match, synonym);
    });
  }

  // Reassert energy and signature caps post stylistic passes
  energyCount = countMatches(output, energyRegex);
  enforceEnergyCap();
  energyCount = countMatches(output, energyRegex);
  if (isCapricorn && energyCount > 0) {
    const capSynonyms = ['current', 'presence', 'pull', 'momentum', 'tone'];
    let capIndex = 0;
    output = output.replace(/\benergy\b/gi, (match) => {
      const synonym = capSynonyms[capIndex % capSynonyms.length];
      capIndex += 1;
      return adjustCase(match, synonym);
    });
    energyCount = countMatches(output, energyRegex);
  }
  finalEnergy = energyCount;

  if (isCapricorn) {
    const fragmentPassCap = enforceThereFragmentsPass(output);
    if (fragmentPassCap.fragmentsFixed || fragmentPassCap.clausesNormalized) {
      output = fragmentPassCap.text;
      fragmentsFixed += fragmentPassCap.fragmentsFixed;
      clausesNormalized += fragmentPassCap.clausesNormalized;
    }
  }

  let additionalSoftened = 0;
  finalSignatureMatches = collectSignatureMatches(output);
  while (finalSignatureMatches.length > 3) {
    const target = finalSignatureMatches[3];
    const softVariant = POST_FLIGHT_SIGNATURE_SOFT[softRotationIndex % POST_FLIGHT_SIGNATURE_SOFT.length];
    softRotationIndex += 1;
    additionalSoftened += 1;
    const softened = buildSoftenedSignature(target.text, softVariant);
    output = `${output.slice(0, target.start)}${softened}${output.slice(target.end)}`;
    finalSignatureMatches = collectSignatureMatches(output);
  }
  signatureSoftened += additionalSoftened;
  finalSignature = finalSignatureMatches.length;

  ellipsesCount = countMatches(output, /…/g);
  questionCount = countMatches(output, /\?/g);
  letsCount = countMatches(output, /\bLet[''']s\b/gi);
  const finalLines = output.split('\n');
  staccatoShare = computeStaccatoShare(finalLines);


  const fragmentCheckRegex = /\bthere\s+(?:also\s+)?(?:just\s+)?(saying|warning|forcing|buzzing|trying|about|not|waiting|here|screaming|showing|a|the)\b/i;
  const remainingFragments = fragmentCheckRegex.test(output);
  if (remainingFragments) {
    console.warn('[post-flight] WARN: residual "there" fragments detected after enforcement.');
  }

  console.log(
    `[post-flight] energy ${initialEnergy}→${finalEnergy} (replacements=${energyReplacements}), signature ${initialSignatureMatches.length}→${finalSignature} (softened=${signatureSoftened}), fragmentsFixed=${fragmentsFixed}, clausesNormalized=${clausesNormalized}, nounCollapses=${nounCollapses}, commaFixes=${commaFixes}, nounSeamsCollapsed=${nounSeamsCollapsed}, genericEnergyFixes=${genericEnergyFixes.length}, ellipses=${ellipsesCount}, questions=${questionCount}/${questionsAllowed} (injected=${questionsInjected}, trimmed=${questionsTrimmed}, afterRate=${(questionsAllowed ? questionCount / questionsAllowed : 0).toFixed(2)}), staccatoShare=${staccatoShare.toFixed(2)} (before=${staccatoBefore.toFixed(2)}), merges=${mergesApplied}, standaloneMerged=${standaloneMerged}, windowsAdjusted=${windowsAdjusted}, lets=${letsCount}, longLineFixes=${longLineFixes}, airModWindows=${airModWindows}, airShortBeatsInlined=${airShortBeatsInlined}, anchorBeats=${anchorBeatsApplied}, fillerClustersTrimmed=${fillerClustersTrimmed}, ctaExclaimFixes=${ctaExclaimFixes}, pivotReactionRotations=${pivotReactionRotations}${STACCATO_SAFE_MODE ? ', safeMode=1' : ''}${QUESTIONS_THROTTLE_FACTOR !== 1 ? `, throttle=${QUESTIONS_THROTTLE_FACTOR.toFixed(2)}` : ''}, bannersRemoved=${hygiene.removed}, punctFixes=${punctFixes}`
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
    ellipsesCount,
    questionCount,
    staccatoShare,
    letsCount,
    longLineFixes,
    airModWindows,
    anchorBeatsApplied,
    bannersRemoved: hygiene.removed,
    punctFixes,
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

export async function generateFullReading(sign: string, options: { seed?: string; mode?: string; with_breaks?: boolean } = {}) {
  console.log(`[generate] Starting full reading generation for ${sign}`);
  
  const validatorHash = computeValidatorHash();
  const allowDrift = process.env.ALLOW_VALIDATOR_DRIFT === 'true';
  if (!allowDrift && validatorHash !== EXPECTED_VALIDATOR_HASH) {
    const message = 'Validator drift detected — expected v5.3.0-stable hash. Aborting generation.';
    console.error(`[generate] ${message}`);
    throw new Error(message);
  }

  if (options.seed) {
    process.env.GENERATION_SEED = options.seed;
  }
  if (options.mode) {
    process.env.GENERATION_MODE = options.mode;
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

    // 3) Sanitize (remove debug logs and any LLM-hallucinated banners)
    console.log('[generate] Sanitizing content...');
    let stitchedSanitized = sanitizeForOutput(stitchedRaw, { breaks: 'none' });
    // Strip any banners that the LLM may have hallucinated (anywhere in text, not just start-of-line)
    const bannersBeforeStrip = (stitchedSanitized.match(/\[validator_hash=[^\]]*\]/g) || []).length;
    stitchedSanitized = stitchedSanitized.replace(/\[validator_hash=[^\]]*\]\n?/g, '');
    const bannersAfterStrip = (stitchedSanitized.match(/\[validator_hash=[^\]]*\]/g) || []).length;
    console.log(`[generate] Stripped ${bannersBeforeStrip - bannersAfterStrip} LLM-hallucinated banners`);
    const postFlight = enforcePostFlight(stitchedSanitized, sign);
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
    const banner = `[validator_hash=${validatorHash} | pass_order=card>contextual>fragments>redundant>noun-collision>plural>synonyms>safeguards | energy=${postFlight.energyBefore}→${postFlight.energyAfter} | signature=${postFlight.signatureBefore}→${postFlight.signatureAfter} | ellipses=${postFlight.ellipsesCount} | questions=${postFlight.questionCount} | staccatoShare=${postFlight.staccatoShare.toFixed(2)} | lets=${postFlight.letsCount} | longLineFixes=${postFlight.longLineFixes} | airWindows=${postFlight.airModWindows} | anchorBeats=${postFlight.anchorBeatsApplied}]`;
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
    return { plainName, breaksName, metrics: postFlight };
    
  } catch (error) {
    console.error('[generate] Error during generation:', error);
    throw error;
  }
}

function stripDuplicateBanners(text: string): { text: string; removed: number } {
  const lines = text.split('\n');
  let bannerSeen = false;
  let removed = 0;
  const filtered = lines.filter((line) => {
    if (/^\[validator_hash=/.test(line.trim())) {
      if (bannerSeen) {
        removed += 1;
        return false;
      }
      bannerSeen = true;
      return true;
    }
    return true;
  });
  return { text: filtered.join('\n'), removed };
}
