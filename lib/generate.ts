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

const QUESTION_TEMPLATES = [
  'Is this really yours to carry?',
  "What's the lesson?",
  "Where's the boundary?",
  'What would honesty change here?',
  'What happens if you stop performing?'
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
  "Okay… so here’s what I’m seeing.",
  "Let’s not pretend you didn’t feel that.",
  "Be honest—what changed after that call?"
];

const REVEAL_PAIR_SENTENCE = "Here’s the part you don’t want to say… You knew before you said it.";

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

  // (#6) Explicit card-name pivots
  const cardReframeOptions = [
    'What shifts when you sit with that?',
    'Where does it land in you?',
    'What does that ask of you now?'
  ];
  const cardReframeRotation = { value: 0 };
  const cardParagraphs = splitIntoParagraphs(output);
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
    const declarative = ensureTrailingPunctuation(`${header} is here showing you what this moment is about.`);
    const reframe = pickRotating(cardReframeOptions, cardReframeRotation);
    cardParagraphs[i] = `${declarative} ${reframe}\n${paragraph}`;
    enforcedCards.add(normalizedKey);
  }
  output = joinParagraphs(cardParagraphs);

  // (#1) Ellipses as breath markers
  let ellipsesCount = countMatches(output, /\.\.\./g);
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
      return `${punct}${gap}… ${word}`;
    });
  }
  if (ellipsesNeeded > 0) {
    applyEllipsisPass(/(^|[.!?])(\s*)(I|You|We)\s+(admit|pretend|feel|know)\b/gi, (_match, punct = '', spaces = '', subject: string, verb: string) => {
      const gap = spaces || '';
      return `${punct}${gap}… ${subject} ${verb}`;
    });
  }
  if (ellipsesNeeded > 0) {
    applyEllipsisPass(/(You knew before you said it)/g, () => '… You knew before you said it');
  }
  ellipsesCount = countMatches(output, /\.\.\./g);

  // (#8) Reflective pivots
  let reflectiveTransforms = 0;
  output = output.replace(/\b(This|That) means ([^.?!\n]+)\./g, (match, _lead: string, rest: string) => {
    if (reflectiveTransforms >= 3) return match;
    reflectiveTransforms += 1;
    return `So maybe… this is what ${rest.trim()} looks like?`;
  });

  // (#2) Interrogative density
  let questionCount = countMatches(output, /\?/g);
  const updatedWordCount = Math.max(countWords(output), 1);
  const updatedPerK = Math.max(updatedWordCount / 1000, 0.2);
  const minQuestions = Math.max(1, Math.round(5 * updatedPerK));
  const maxQuestions = Math.max(minQuestions, Math.round(8 * updatedPerK));
  const targetQuestions = Math.max(minQuestions, Math.min(Math.round(7 * updatedPerK), maxQuestions));
  let questionsNeeded = Math.max(0, Math.min(targetQuestions, maxQuestions) - questionCount);
  const questionRotation = { value: 0 };
  let paragraphsForQuestions = splitIntoParagraphs(output);
  const paragraphsWithQuestions = new Set<number>();
  for (let i = 0; i < paragraphsForQuestions.length && questionsNeeded > 0; i += 1) {
    const paragraph = paragraphsForQuestions[i];
    if (!paragraph.trim()) continue;
    if ((paragraph.match(/\?/g) || []).length > 0) {
      paragraphsWithQuestions.add(i);
      continue;
    }
    const hook = pickRotating(QUESTION_TEMPLATES, questionRotation);
    paragraphsForQuestions[i] = `${ensureTrailingPunctuation(paragraph.trim())} ${hook}`;
    questionCount += 1;
    questionsNeeded -= 1;
    paragraphsWithQuestions.add(i);
  }
  if (questionsNeeded > 0) {
    for (let i = 0; i < paragraphsForQuestions.length && questionsNeeded > 0; i += 1) {
      if (paragraphsWithQuestions.has(i)) continue;
      const hook = pickRotating(QUESTION_TEMPLATES, questionRotation);
      paragraphsForQuestions.splice(i + 1, 0, hook);
      questionCount += 1;
      questionsNeeded -= 1;
      i += 1;
    }
  }
  output = joinParagraphs(paragraphsForQuestions);

  // (#3, #12) De-exclaim and closure softening
  output = output
    .replace(/You already know what to do!/gi, 'You already know what to do… right?')
    .replace(/That’s all I’ve got for now!/gi, "That's all for now… take it in.")
    .replace(/That's all I've got for now!/gi, "That's all for now… take it in.")
    .replace(/Please like, subscribe, tell your group chat!/gi, 'Please like, subscribe, tell your group chat.')
    .replace(/I’ll see y’all soon!/gi, "I'll see y'all soon.")
    .replace(/I'll see y'all soon!/gi, "I'll see y'all soon.");
  output = output.replace(/!([ \n]|$)/g, '.$1');
  if (output.endsWith('!')) {
    output = `${output.slice(0, -1)}.`;
  }

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

  // (#4) Inclusive “let’s” invitations
  let letsCount = countMatches(output, /\bLet’s\b/gi);
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
      paragraphsForLets.splice(i + 1, 0, prompt);
      letsCount += 1;
      lastInsertedIndex = i + 1;
      i += 1;
    }
    let idx = 0;
    while (letsCount < 3 && idx < paragraphsForLets.length) {
      if (Math.abs(idx - lastInsertedIndex) > 1) {
        const prompt = pickRotating(LETS_TEMPLATES, letsRotation);
        paragraphsForLets.splice(idx, 0, prompt);
        letsCount += 1;
        lastInsertedIndex = idx;
        idx += 1;
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

  // (#5) Staccato share adjustments (with #10 prep)
  let anchorBeatsApplied = 0;
  let linesForStaccato = output.split('\n');
  let staccatoShare = computeStaccatoShare(linesForStaccato);
  const staccatoMin = isCapricorn ? 0.15 : 0.20;
  const staccatoMax = isCapricorn ? 0.20 : 0.25;
  const splitForStaccato = (line: string): [string, string] | null => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 6) return null;
    const splitIndex = Math.min(6, Math.max(4, Math.floor(words.length / 2)));
    const first = words.slice(0, splitIndex).join(' ').trim();
    const second = words.slice(splitIndex).join(' ').trim();
    if (!first || !second) return null;
    return [ensureTrailingPunctuation(first), ensureTrailingPunctuation(second)];
  };
  let staccatoPasses = 0;
  while (staccatoShare < staccatoMin && staccatoShare < staccatoMax) {
    let changed = false;
    for (let i = 0; i < linesForStaccato.length && staccatoShare < staccatoMin; i += 1) {
      const line = linesForStaccato[i];
      if (countWords(line) <= 12) continue;
      const split = splitForStaccato(line);
      if (!split) continue;
      linesForStaccato.splice(i, 1, split[0], split[1]);
      changed = true;
      break;
    }
    if (!changed) break;
    staccatoPasses += 1;
    staccatoShare = computeStaccatoShare(linesForStaccato);
  }
  if (staccatoShare > staccatoMax) {
    for (let i = 0; i < linesForStaccato.length - 1 && staccatoShare > staccatoMax; i += 1) {
      if (countWords(linesForStaccato[i]) <= 6) {
        linesForStaccato[i] = `${linesForStaccato[i]} ${linesForStaccato[i + 1]}`.trim();
        linesForStaccato.splice(i + 1, 1);
        staccatoShare = computeStaccatoShare(linesForStaccato);
        i -= 1;
      }
    }
  }
  output = linesForStaccato.join('\n');
  staccatoShare = computeStaccatoShare(linesForStaccato);

  // (#10) Anchor cadence for Scorpio & Pisces
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
    for (let i = 0; i < paragraphsAir.length; i += 1) {
      const windowIndex = Math.floor(cumulative / windowSize);
      const alreadyHasBeat = /You feel that shift\.|Hear the new current\.|This pause is loud\.|See the open door\.|Feel the air change\./.test(paragraphsAir[i]);
      if (!alreadyHasBeat && wordsPerParagraph[i] > 0) {
        const shortBeat = pickRotating(AIR_SHORT_BEATS, shortRotation);
        const longBeatBase = pickRotating(AIR_LONG_BEATS, longRotation);
        const connective = pickRotating(AIR_CONNECTIVES, connectiveRotation);
        const longBeat = `${connective.charAt(0).toUpperCase() + connective.slice(1)}, ${longBeatBase.charAt(0).toLowerCase() + longBeatBase.slice(1)}`;
        const extraQuestion = pickRotating(QUESTION_TEMPLATES, questionRotation);
        paragraphsAir[i] = `${shortBeat}\n${longBeat}\n${extraQuestion}\n${paragraphsAir[i]}`;
        airModWindows += 1;
        questionCount += 1;
      }
      cumulative += wordsPerParagraph[i];
    }
    output = joinParagraphs(paragraphsAir);
  }

  // (#13) Reveal cadence pair
  const revealTarget = Math.max(1, Math.round(Math.max(countWords(output) / 1000, 0.75)));
  let revealCount = countMatches(output, /Here’s the part you don’t want to say…/g);
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

  // (#15) Long-line guard (>28 words sans punctuation)
  let longLineFixes = 0;
  let linesForGuard = output.split('\n');
  for (let i = 0; i < linesForGuard.length; i += 1) {
    const line = linesForGuard[i];
    if (countWords(line) > 28 && !/[.,;:!?—…]/.test(line)) {
      const words = line.trim().split(/\s+/);
      const splitIndex = Math.floor(words.length / 2);
      const first = ensureTrailingPunctuation(words.slice(0, splitIndex).join(' '), '…');
      const second = ensureTrailingPunctuation(words.slice(splitIndex).join(' '));
      linesForGuard.splice(i, 1, first, second);
      longLineFixes += 1;
      i += 1;
    }
  }
  output = linesForGuard.join('\n');

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

  ellipsesCount = countMatches(output, /\.\.\./g);
  questionCount = countMatches(output, /\?/g);
  letsCount = countMatches(output, /\bLet’s\b/gi);
  const finalLines = output.split('\n');
  staccatoShare = computeStaccatoShare(finalLines);


  const fragmentCheckRegex = /\bthere\s+(?:also\s+)?(?:just\s+)?(saying|warning|forcing|buzzing|trying|about|not|waiting|here|screaming|showing|a|the)\b/i;
  const remainingFragments = fragmentCheckRegex.test(output);
  if (remainingFragments) {
    console.warn('[post-flight] WARN: residual "there" fragments detected after enforcement.');
  }

  console.log(
    `[post-flight] energy ${initialEnergy}→${finalEnergy} (replacements=${energyReplacements}), signature ${initialSignatureMatches.length}→${finalSignature} (softened=${signatureSoftened}), fragmentsFixed=${fragmentsFixed}, clausesNormalized=${clausesNormalized}, nounCollapses=${nounCollapses}, commaFixes=${commaFixes}, nounSeamsCollapsed=${nounSeamsCollapsed}, genericEnergyFixes=${genericEnergyFixes.length}, ellipses=${ellipsesCount}, questions=${questionCount}, staccatoShare=${staccatoShare.toFixed(2)}, lets=${letsCount}, longLineFixes=${longLineFixes}, airModWindows=${airModWindows}, anchorBeats=${anchorBeatsApplied}`
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
    return { plainName, breaksName };
    
  } catch (error) {
    console.error('[generate] Error during generation:', error);
    throw error;
  }
}
