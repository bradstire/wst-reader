// Tarot spread generation with uniqueness enforcement

// Full 78-card Rider-Waite deck
const MAJORS = [
  "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor", 
  "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit", 
  "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance", 
  "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World"
];

const SUITS = {
  "Wands": ["Ace of Wands","Two of Wands","Three of Wands","Four of Wands","Five of Wands","Six of Wands",
            "Seven of Wands","Eight of Wands","Nine of Wands","Ten of Wands","Page of Wands",
            "Knight of Wands","Queen of Wands","King of Wands"],
  "Cups": ["Ace of Cups","Two of Cups","Three of Cups","Four of Cups","Five of Cups","Six of Cups",
           "Seven of Cups","Eight of Cups","Nine of Cups","Ten of Cups","Page of Cups",
           "Knight of Cups","Queen of Cups","King of Cups"],
  "Swords": ["Ace of Swords","Two of Swords","Three of Swords","Four of Swords","Five of Swords","Six of Swords",
             "Seven of Swords","Eight of Swords","Nine of Swords","Ten of Swords","Page of Swords",
             "Knight of Swords","Queen of Swords","King of Swords"],
  "Pentacles": ["Ace of Pentacles","Two of Pentacles","Three of Pentacles","Four of Pentacles","Five of Pentacles","Six of Pentacles",
                "Seven of Pentacles","Eight of Pentacles","Nine of Pentacles","Ten of Pentacles","Page of Pentacles",
                "Knight of Pentacles","Queen of Pentacles","King of Pentacles"]
};

const DECK = [...MAJORS, ...Object.values(SUITS).flat()];

function baseTitle(cardTitle: string): string {
  return cardTitle.replace(/, reversed$/i, '').trim();
}

function drawOne(deck: string[], reversedProb: number = 0.5): { title: string; reversed: boolean } {
  const idx = Math.floor(Math.random() * deck.length);
  const card = deck.splice(idx, 1)[0]; // Remove from deck
  const reversed = Math.random() < reversedProb;
  
  return {
    title: reversed ? `${card}, reversed` : card,
    reversed
  };
}

export function drawSpread(reversedProb: number = 0.5): string[] {
  const chosen: string[] = [];
  const used = new Set<string>();
  const workingDeck = [...DECK];
  
  // Shuffle working deck
  for (let i = workingDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [workingDeck[i], workingDeck[j]] = [workingDeck[j], workingDeck[i]];
  }
  
  while (chosen.length < 5) {
    if (workingDeck.length === 0) {
      throw new Error("Not enough unique cards in deck");
    }
    
    const pick = drawOne(workingDeck, reversedProb);
    const key = baseTitle(pick.title);
    
    // CRITICAL: Reject duplicates regardless of orientation
    if (used.has(key)) {
      continue;
    }
    
    used.add(key);
    chosen.push(pick.title);
  }
  
  console.log(`[spread-lock] ${chosen.join(' | ')}`);
  return chosen;
}

export function drawClarifiers(usedCards: Set<string>, maxCount: number = 2): string[] {
  const clarifiers: string[] = [];
  const workingDeck = DECK.filter(card => !usedCards.has(baseTitle(card)));
  
  // Shuffle
  for (let i = workingDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [workingDeck[i], workingDeck[j]] = [workingDeck[j], workingDeck[i]];
  }
  
  for (let i = 0; i < Math.min(maxCount, workingDeck.length); i++) {
    const pick = drawOne(workingDeck, 0.5);
    clarifiers.push(pick.title);
  }
  
  return clarifiers;
}

