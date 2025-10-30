// Minimal linear-narrative validator and sanitizer
// Ensures only already-revealed cards are mentioned; clarifiers may only be
// named after an explicit "Clarifiers:" reveal line.

const normalize = (s: string) => (s || "").trim();

function buildCardRegex(card: string): RegExp {
  // Escape spaces and of, allow optional leading "The ", preserve optional ", reversed"
  // We only match the exact provided card text (already includes orientation if any)
  const escaped = card.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Also match without leading "The " if present in data
  const variants = [escaped];
  if (/^The\s+/i.test(card)) {
    variants.push(escaped.replace(/^The\s+/i, ""));
  } else {
    variants.push(`The\\s+${escaped}`);
  }
  return new RegExp(`(?:${variants.join("|")})(?![\w-])`, "gi");
}

export interface LinearValidationInput {
  chapterIndex: number; // 1-6
  text: string;
  revealedCards: string[]; // cards revealed up to and including this chapter
  clarifiers: string[]; // raw clarifier names (may be empty)
}

export function enforceLinearNarrative({
  chapterIndex,
  text,
  revealedCards,
  clarifiers,
}: LinearValidationInput): { text: string; violations: string[] } {
  let output = text || "";
  const violations: string[] = [];

  // Determine if clarifiers have been explicitly revealed in this chapter
  const clarifiersLineMatch = output.match(/^\s*Clarifiers:\s*(.+)$/im);
  const clarifiersAreRevealed = Boolean(clarifiersLineMatch);

  // Only allow mentions of revealed spread cards (up to chapterIndex)
  const allowedCards = new Set(revealedCards.map(normalize));

  // Redact any of the five spread cards that are not yet revealed
  const redactCard = (card: string) => {
    const rx = buildCardRegex(card);
    if (!allowedCards.has(normalize(card))) {
      if (rx.test(output)) {
        violations.push(`forward-reference:${card}`);
        output = output.replace(rx, "this energy");
      }
    }
  };

  // Process all five cards defensively (in case future cards leaked)
  // We don't know the unrevealed ones here; caller should pass all 5 and allowed set
  revealedCards.forEach(() => void 0);

  // The function caller should handle iterating unrevealed cards too; export helper
  return { text: output, violations };
}

export function redactUnrevealedCards(
  text: string,
  allCards: string[],
  allowedCardsNow: string[],
  clarifiers: string[]
): { text: string; violations: string[] } {
  let output = text || "";
  const violations: string[] = [];
  const allowed = new Set(allowedCardsNow.map(normalize));

  // Clarifiers: only allowed AFTER an explicit reveal line
  const clarifiersLineIdx = output.search(/^\s*Clarifiers:\s*(.+)$/im);
  const clarifiersAllowedEverywhere = clarifiersLineIdx >= 0;

  // Redact unrevealed spread cards
  for (const card of allCards) {
    const rx = buildCardRegex(card);
    if (!allowed.has(normalize(card)) && rx.test(output)) {
      violations.push(`forward-reference:${card}`);
      output = output.replace(rx, "this energy");
    }
  }

  // Redact clarifier names if mentioned before the reveal line
  if (clarifiers.length > 0 && clarifiersLineIdx >= 0) {
    // Before index only
    const before = output.slice(0, clarifiersLineIdx);
    const after = output.slice(clarifiersLineIdx);
    let beforeMut = before;
    for (const cl of clarifiers) {
      const rx = buildCardRegex(cl);
      if (rx.test(beforeMut)) {
        violations.push(`clarifier-early:${cl}`);
        beforeMut = beforeMut.replace(rx, "the clarifier");
      }
    }
    output = beforeMut + after;
  } else if (!clarifiersAllowedEverywhere && clarifiers.length > 0) {
    // No reveal line: redact all explicit clarifier names
    for (const cl of clarifiers) {
      const rx = buildCardRegex(cl);
      if (rx.test(output)) {
        violations.push(`clarifier-early:${cl}`);
        output = output.replace(rx, "the clarifier");
      }
    }
  }

  return { text: output, violations };
}


