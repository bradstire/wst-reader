// Linear narrative validator/redactor for White Soul Tarot 2

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function baseTitle(cardTitle: string): string {
  return cardTitle.replace(/,\s*reversed$/i, '').trim();
}

function buildCardRegex(cardTitle: string): RegExp {
  const title = escapeRegExp(baseTitle(cardTitle));
  // Match upright or ", reversed"
  return new RegExp(`\\b${title}(?:,\\s*reversed)?\\b`, 'gi');
}

export function redactUnrevealedCards(
  chapterText: string,
  spreadCards: string[],
  revealedCards: string[],
  clarifierCards: string[]
): { text: string; changed: boolean } {
  let text = chapterText;
  let changed = false;

  const revealedSet = new Set(revealedCards.map(baseTitle));
  const unrevealed = spreadCards
    .map(baseTitle)
    .filter((t) => !revealedSet.has(t));

  // 1) Redact mentions of unrevealed spread cards
  for (const unrevealedTitle of unrevealed) {
    const rx = buildCardRegex(unrevealedTitle);
    if (rx.test(text)) {
      text = text.replace(rx, 'this energy');
      changed = true;
    }
  }

  // 2) Clarifiers can only be mentioned AFTER an explicit reveal line
  // Detect first line that introduces clarifiers
  const lines = text.split('\n');
  let clarifiersIntroduced = clarifierCards.length === 0;
  const clarifierTitles = clarifierCards.map(baseTitle);
  const clarifierRevealLine = new RegExp(
    `^\\s*Clarifiers?\\s*:\\s*(.+)$`,
    'i'
  );
  const clarifierWordRegex = /\b[Cc]larifiers?\b:?/g;

  const redactClarifierLine = (line: string): string => {
    let redacted = line;
    for (const t of clarifierTitles) {
      const rx = buildCardRegex(t);
      if (rx.test(redacted)) {
        redacted = redacted.replace(rx, 'this energy');
        changed = true;
      }
    }
    return redacted;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!clarifiersIntroduced) {
      const m = line.match(clarifierRevealLine);
      if (m) {
        // Remove the "Clarifiers: X | Y" line entirely—this should not appear in script
        clarifiersIntroduced = true;
        lines[i] = ''; // Delete this line
        changed = true;
        continue;
      }
      // Before reveal, redact any clarifier mentions
      let sanitized = redactClarifierLine(line);
      // Also hide the word "clarifier(s)" before reveal to avoid "clarifiers log" phrasing
      if (clarifierWordRegex.test(sanitized)) {
        sanitized = sanitized.replace(clarifierWordRegex, 'supporting energies');
        changed = true;
      }
      lines[i] = sanitized;
    }
  }

  let finalText = lines.join('\n');
  
  // 3) Replace all "this energy" placeholders with contextual alternatives
  const contextualReplacements = [
    // Catch doubled-up placeholders first
    { pattern: /\bthis energy\s+(influence|vibe|current|undertone|pull|presence|mood|charge|force|undercurrent)\b/gi, replacement: 'that $1' },
    { pattern: /\bthis energy\s+energy\b/gi, replacement: 'this influence' },
    { pattern: /\bthat this energy\s+energy\b/gi, replacement: 'that influence' },
    { pattern: /\bthis energy\s+(reversed|lurking|sitting|hovering|underneath|beneath|feeding|anchoring)\b/gi, replacement: 'this influence' },
    { pattern: /\b(the|this|with the|and the|what's feeding into this is that)\s+this energy\b/gi, replacement: 'this influence' },
    // Replace standalone "this energy" in common phrases
    { pattern: /this energy is whispering/gi, replacement: 'there\'s a whisper' },
    { pattern: /And then there's this energy\./gi, replacement: 'And then there\'s this undercurrent.' },
    { pattern: /The supporting energy underneath is this energy\./gi, replacement: 'There\'s something underlying this.' },
    { pattern: /\bthis energy\s+(is|was|were|has|have)\s+/gi, replacement: 'there ' },
    { pattern: /\bthis energy\s+(shows|suggests|points|tells|means)\s+/gi, replacement: 'this ' },
    { pattern: /\band this energy\b/gi, replacement: 'and this undercurrent' },
    { pattern: /\bor this energy\b/gi, replacement: 'or this current' },
    { pattern: /\bbut this energy\b/gi, replacement: 'but this vibe' },
    { pattern: /\bis this energy\b/gi, replacement: 'is this current' },
  ];
  
  const beforeCleanup = finalText;
  for (const { pattern, replacement } of contextualReplacements) {
    finalText = finalText.replace(pattern, replacement);
  }
  
  // 4) Capitalize Spirit consistently
  finalText = finalText.replace(/\bspirit\b/g, 'Spirit');
  
  // 5) Fix grammatical fragments and comma splices
  const fragmentFixes = [
    { pattern: /\bthere the kind of energy\b/gi, replacement: 'That\'s the kind of vibe' },
    { pattern: /\bthere the kind of\b/gi, replacement: 'That\'s the kind of' },
    { pattern: /\bthere loud\.\b/gi, replacement: 'It\'s loud.' },
    { pattern: /\bthere the emotional immature\b/gi, replacement: 'That\'s the emotionally immature' },
    { pattern: /\bthere anchored by\b/gi, replacement: 'It\'s anchored by' },
    { pattern: /\bthere like your foot\b/gi, replacement: 'It\'s like your foot' },
    { pattern: /\bthere that hesitation\b/gi, replacement: 'There\'s that hesitation' },
    { pattern: /\bthere (tricky|raw|holding|hanging)\b/gi, replacement: 'It\'s $1' }, // Catch "there + adjective"
    { pattern: /this energy\s*,\s*is\b/gi, replacement: 'This influence is' }, // Fix comma splice
    { pattern: /this energy\s*,\s*also\b/gi, replacement: 'This influence also' }, // Fix comma splice
    { pattern: /\bthere the\b/gi, replacement: 'that\'s the' }, // Catch-all for "there the X"
    // New: fix "this influence" comma splices
    { pattern: /\bthe this influence\b/gi, replacement: 'that influence' },
    { pattern: /\bthis influence\s*,\s*is\b/gi, replacement: 'This influence is' },
    { pattern: /\bthis influence\s*,\s*was\b/gi, replacement: 'This influence was' },
    { pattern: /\bthis influence\s*,\s*shows\b/gi, replacement: 'This influence shows' },
    { pattern: /\bthat influence\s*,\s*is\b/gi, replacement: 'That influence is' },
    { pattern: /\bthat influence\s*,\s*was\b/gi, replacement: 'That influence was' },
    // More "there ..." fragments without verbs
    { pattern: /\bthere cutting through\b/gi, replacement: 'There\'s clarity cutting through' },
    { pattern: /\bthere pushing you\b/gi, replacement: 'It\'s pushing you' },
    { pattern: /\bthere pushing against\b/gi, replacement: 'It\'s pushing against' },
    { pattern: /\bthere flipping the script\b/gi, replacement: 'It\'s flipping the script' },
    // Additional "there ..." fragments
    { pattern: /\bthere not gentle\b/gi, replacement: 'It\'s not gentle' },
    { pattern: /\bthere quietly telling\b/gi, replacement: 'They\'re quietly telling' },
    { pattern: /\bthere like the calm\b/gi, replacement: 'It\'s like the calm' },
    { pattern: /\bthere all about\b/gi, replacement: 'They\'re all about' },
    { pattern: /\bthere supposed to be\b/gi, replacement: 'They\'re supposed to be' },
    { pattern: /\bthere demanding\b/gi, replacement: 'They\'re demanding' },
    { pattern: /\bthere not about\b/gi, replacement: 'It\'s not about' },
  ];
  
  for (const { pattern, replacement } of fragmentFixes) {
    finalText = finalText.replace(pattern, replacement);
  }
  
  // 5b) Fix redundant "it" after "this/that influence" and double echoes
  const redundantFixes = [
    { pattern: /\bthis influence it\s+/gi, replacement: 'this influence ' },
    { pattern: /\bthat influence it\s+/gi, replacement: 'that influence ' },
    { pattern: /\bthe influence of this influence\b/gi, replacement: 'that influence' },
    { pattern: /\bthe influence of that influence\b/gi, replacement: 'that influence' },
    // Fix duplicate "this" words
    { pattern: /\bthis influence this\s+/gi, replacement: 'this influence ' },
    { pattern: /\bthis this\b/gi, replacement: 'this' },
    { pattern: /\bthat that\b/gi, replacement: 'that' },
    { pattern: /\bthis the\b/gi, replacement: 'this is the' },
    // Fix double determiners
    { pattern: /\bThere's a that\b/gi, replacement: 'There\'s a' },
    { pattern: /\bThe that\b/gi, replacement: 'That' },
    { pattern: /\ba that\b/gi, replacement: 'a' },
    { pattern: /\bthe that\b/gi, replacement: 'that' },
    { pattern: /\bthat reversed that\b/gi, replacement: 'that reversed' },
    { pattern: /\bthis reversed that\b/gi, replacement: 'this reversed' },
    { pattern: /\breversed that vibe\b/gi, replacement: 'reversed vibe' },
    { pattern: /\b(this|that) influence card reversed\b/gi, replacement: '$1 reversed influence' },
    // Fix doubled noun phrases
    { pattern: /\bthat influence this energy\s+/gi, replacement: 'that influence ' },
    { pattern: /\bthis energy that influence\s+/gi, replacement: 'that influence ' },
  ];
  
  for (const { pattern, replacement } of redundantFixes) {
    finalText = finalText.replace(pattern, replacement);
  }

  // 5c) Resolve noun collisions (keep strongest noun)
  const nounCollisionFixes = [
    { pattern: /\bthat reversed this (current|undertone|pull|presence|tone|force)\b/gi, replacement: 'that reversed $1' },
    { pattern: /\bthis reversed this (current|undertone|pull|presence|tone|force)\b/gi, replacement: 'this reversed $1' },
    { pattern: /\bthis energy['’]s influence\b/gi, replacement: 'this influence' },
    { pattern: /\bthat energy['’]s influence\b/gi, replacement: 'that influence' },
    { pattern: /\bthis influence['’]s energy\b/gi, replacement: 'this influence' },
    { pattern: /\bthat influence['’]s energy\b/gi, replacement: 'that influence' },
    { pattern: /\bthis influence's vibe\b/gi, replacement: 'this vibe' },
    { pattern: /\bthat influence's vibe\b/gi, replacement: 'that vibe' },
    { pattern: /\bthis influence this energy\b/gi, replacement: 'this influence' },
  ];

  for (const { pattern, replacement } of nounCollisionFixes) {
    finalText = finalText.replace(pattern, replacement);
  }
  
  // 5d) Fix plural/singular mismatches
  const pluralFixes = [
    { pattern: /\bas a supporting energies\b/gi, replacement: 'as a supporting influence' },
    { pattern: /\bsupporting energies is\b/gi, replacement: 'supporting influence is' },
    { pattern: /\bsupporting energies\s+(reminding|telling|showing)/gi, replacement: 'supporting influence $1' },
  ];
  
  for (const { pattern, replacement } of pluralFixes) {
    finalText = finalText.replace(pattern, replacement);
  }
  
  // 5e) Fix "this energy" or "this influence" doubles in same sentence
  // Replace second occurrence with synonym
  const doubledLines = finalText.split('\n');
  for (let i = 0; i < doubledLines.length; i++) {
    const line = doubledLines[i];
    // Check for "this energy" appearing twice
    if ((line.match(/\bthis energy\b/gi) || []).length > 1) {
      doubledLines[i] = line.replace(/\bthis energy\b/gi, (match, offset) => {
        // First occurrence stays, replace subsequent ones
        const prevMatches = (line.substring(0, offset).match(/\bthis energy\b/gi) || []).length;
        return prevMatches === 0 ? match : 'this current';
      });
    }
    // Check for "this influence" appearing twice
    if ((line.match(/\bthis influence\b/gi) || []).length > 1) {
      doubledLines[i] = line.replace(/\bthis influence\b/gi, (match, offset) => {
        const prevMatches = (line.substring(0, offset).match(/\bthis influence\b/gi) || []).length;
        return prevMatches === 0 ? match : 'this vibe';
      });
    }
    // Check for standalone "influence" appearing twice
    if ((line.match(/\binfluence\b/gi) || []).length > 1) {
      doubledLines[i] = line.replace(/\binfluence\b/gi, (match, offset) => {
        const prevMatches = (line.substring(0, offset).match(/\binfluence\b/gi) || []).length;
        // Replace second occurrence with a synonym
        return prevMatches === 0 ? match : ['current', 'vibe', 'pull', 'force'][prevMatches % 4];
      });
    }
    // Check for standalone "energy" appearing twice (rare, but catch it)
    if ((line.match(/\benergy\b/gi) || []).length > 1) {
      doubledLines[i] = line.replace(/\benergy\b/gi, (match, offset) => {
        const prevMatches = (line.substring(0, offset).match(/\benergy\b/gi) || []).length;
        return prevMatches === 0 ? match : ['vibe', 'current', 'undertone', 'charge'][prevMatches % 4];
      });
    }
  }
  finalText = doubledLines.join('\n');
  
  // 6) Reduce "energy" word count by ~2/3 using varied alternatives
  // Keep only essential uses; replace others with context-appropriate alternatives
  const energyReplacements = [
    // Prioritize most impactful replacements first
    { pattern: /\bthis energy\s+feels\b/gi, replacement: 'this current feels' },
    { pattern: /\bcaught in this energy\b/gi, replacement: 'caught in this pattern' },
    { pattern: /\bthe energy underneath\b/gi, replacement: 'the undertone underneath' },
    { pattern: /\bthat reversed energy\b/gi, replacement: 'that reversed influence' },
    { pattern: /\bthe emotional energy\b/gi, replacement: 'the emotional undertone' },
    { pattern: /\bThat\'s the kind of energy\b/gi, replacement: 'That\'s the kind of vibe' },
    { pattern: /\bThe energy shifts\b/gi, replacement: 'The mood shifts' },
    { pattern: /\bwith this energy\b/gi, replacement: 'with this vibe' },
    { pattern: /\bin this energy\b/gi, replacement: 'in this space' },
    { pattern: /\bof this energy\b/gi, replacement: 'of this current' },
    { pattern: /\bfull of energy\b/gi, replacement: 'full of tension' },
    // Generic fallbacks (used sparingly)
    { pattern: /\benergy\s+loop\b/gi, replacement: 'pattern loop' },
    { pattern: /\benergy\s+here\b/gi, replacement: 'vibe here' },
  ];
  
  // Apply energy replacements but limit to prevent over-substitution
  let energyCount = (finalText.match(/\benergy\b/gi) || []).length;
  for (const { pattern, replacement } of energyReplacements) {
    if (energyCount <= 10) break; // Stop if already below target
    finalText = finalText.replace(pattern, replacement);
    energyCount = (finalText.match(/\benergy\b/gi) || []).length;
  }
  
  // 6b) Reduce excessive "influence" repetition with variety
  const influenceReplacements = [
    { pattern: /\bthis influence feels\b/gi, replacement: 'this vibe feels' },
    { pattern: /\bthat influence holds you\b/gi, replacement: 'that presence holds you' },
    { pattern: /\bthe this influence and this influence\b/gi, replacement: 'those two influences' },
    { pattern: /\bthis influence\s+(pushing|driving|guiding)\b/gi, replacement: 'this pull $1' },
  ];
  
  let influenceCount = (finalText.match(/\binfluence\b/gi) || []).length;
  // Only rotate if "influence" appears more than 8 times
  if (influenceCount > 8) {
    for (const { pattern, replacement } of influenceReplacements) {
      finalText = finalText.replace(pattern, replacement);
      influenceCount = (finalText.match(/\binfluence\b/gi) || []).length;
      if (influenceCount <= 8) break;
    }
  }
  
  // 7) Remove duplicate CTA blocks (only one "Like + Subscribe" should remain)
  const ctaMatches = finalText.match(/Like\s*\+\s*Subscribe/gi);
  if (ctaMatches && ctaMatches.length > 1) {
    // Keep only the last CTA block, remove earlier ones
    const lines = finalText.split('\n');
    let ctaCount = 0;
    const cleanedLines = lines.map(line => {
      if (/Like\s*\+\s*Subscribe/i.test(line)) {
        ctaCount++;
        // Keep only the last occurrence
        if (ctaCount < ctaMatches.length) {
          return ''; // Remove duplicate
        }
      }
      return line;
    });
    finalText = cleanedLines.filter(l => l.trim() !== '').join('\n');
  }
  
  if (finalText !== beforeCleanup) {
    changed = true;
  }
  
  return { text: finalText, changed };
}


