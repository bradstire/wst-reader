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
  
  if (finalText !== beforeCleanup) {
    changed = true;
  }
  
  return { text: finalText, changed };
}


