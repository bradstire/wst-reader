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
    { pattern: /\bthis energy\s+energy\b/gi, replacement: 'this energy' },
    { pattern: /\bthat this energy\s+energy\b/gi, replacement: 'that influence' },
    { pattern: /\bthis energy\s+(reversed|lurking|sitting|hovering|underneath|beneath|feeding|anchoring)\b/gi, replacement: 'this energy' },
    { pattern: /\b(the|this|with the|and the|what's feeding into this is that)\s+this energy\b/gi, replacement: 'this energy' },
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
    { pattern: /this energy\s*,\s*is\b/gi, replacement: 'This influence is' }, // Fix comma splice
    { pattern: /this energy\s*,\s*also\b/gi, replacement: 'This influence also' }, // Fix comma splice
    { pattern: /\bthere the\b/gi, replacement: 'that\'s the' }, // Catch-all for "there the X"
  ];
  
  for (const { pattern, replacement } of fragmentFixes) {
    finalText = finalText.replace(pattern, replacement);
  }
  
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


