// Break duration ranges and their weighted distribution (ported from Python)
// V5.1.2-final: Tuned to reach ~13-15min total break time (max 11s per break)
const BREAK_RANGES = {
  'micro': {
    range: [1.0, 3.5],  // was [0.5, 2.0]
    weight: 0.55,  // 55% of breaks (reduced from 65%)
    description: 'micro-break, breathmark'
  },
  'short': {
    range: [3.5, 7.0],  // was [2.0, 5.0]
    weight: 0.30,  // 30% of breaks (increased from 22.5%)
    description: 'short reflective break'
  },
  'medium': {
    range: [7.0, 9.0],  // was [5.0, 10.0]
    weight: 0.10,  // 10% of breaks (increased from 7.5%)
    description: 'medium weight break'
  },
  'extended': {
    range: [9.0, 11.0],  // was [10.0, 12.0] - CAPPED AT 11s MAX
    weight: 0.05,  // 5% of breaks
    description: 'extended break cap (max 11s)'
  }
};

function getRandomBreakDuration(): number {
  const rand = Math.random();
  let cumulativeWeight = 0;
  
  for (const [breakType, config] of Object.entries(BREAK_RANGES)) {
    cumulativeWeight += config.weight;
    if (rand <= cumulativeWeight) {
      const [minDuration, maxDuration] = config.range;
      // Add some randomization within the range
      const duration = Math.random() * (maxDuration - minDuration) + minDuration;
      return Math.round(duration * 10) / 10; // Round to 1 decimal
    }
  }
  
  // Fallback to micro break
  return Math.round((Math.random() * 1.5 + 0.5) * 10) / 10;
}

function normalizeExistingBreaks(text: string): string {
  // Match various break tag formats and normalize them
  const patterns = [
    /<break\s+time=["']([^"']+)["']\s*\/>/g,  // <break time="2s" />
    /<break\s+time=([^\s>]+)\s*\/>/g,           // <break time=2s />
    /\[break\]/gi,                              // [break]
    /\[BREAK\]/gi,                              // [BREAK]
    /<break\s*\/>/g,                            // <break />
  ];
  
  let result = text;
  
  for (const pattern of patterns) {
    result = result.replace(pattern, (match) => {
      if (match.includes('time=')) {
        // Extract existing time value if present
        const timeMatch = match.match(/time=["']?([^"'>\s]+)/);
        if (timeMatch) {
          const timeStr = timeMatch[1];
          // Try to parse existing duration
          try {
            const duration = timeStr.endsWith('s') 
              ? parseFloat(timeStr.slice(0, -1))
              : parseFloat(timeStr);
            return `<break time="${duration}s" />`;
          } catch (e) {
            // Fall through to generate new duration
          }
        }
      }
      // Generate new random duration
      const duration = getRandomBreakDuration();
      return `<break time="${duration}s" />`;
    });
  }
  
  return result;
}

function shouldAddBreakAfterSentence(sentence: string, index: number, totalSentences: number): boolean {
  const s = sentence.trim();
  
  // V5.1: Add breaks after emotional interjections (single-word pauses)
  if (/^(Hmm?|Okay|Wait|Yeah|Whoa|Sheesh|Anyway|Alright|So|But|And|Still|Hold on|Huh|Oh wow|What|No way)\b\.?$/i.test(s)) {
    return true;
  }
  
  // V5.1: Add breaks after discovery language
  if (/I'm (seeing|getting)|Spirit's (showing|telling|saying)|Let me|Give me a second|Hold on/i.test(s)) {
    return true;
  }
  
  // V5.1: Add breaks after direct address check-ins
  if (/You (feeling|get|knew) (this|it|that)\??|Right\??|This landing( for you)?\??|You already knew/i.test(s)) {
    return true;
  }
  
  // V5.1: Add breaks after mid-stream corrections
  if (/Wait—no|Actually,|Let me rephrase|Scratch that|came out wrong|Wait,/i.test(s)) {
    return true;
  }
  
  // Always add breaks after certain patterns
  if (/you know|okay|right\?|alright/i.test(s)) {
    return true;
  }
  
  // NOTE: Card reveal breaks are now handled separately in applyBreaks()
  // to distinguish between standalone card reveals (3-5s) and mid-sentence reveals (2-3s)
  
  // Add breaks after strong declarative statements
  if (/\.\s*$/.test(s) && s.length > 50) {
    return true;
  }
  
  // Add breaks after laughter markers or parasocial asides
  if (/haha|hehe|lol|lmao|oh my|wow|amazing|incredible/i.test(s)) {
    return true;
  }
  
  // Add breaks at narrative pivots (every 3-6 sentences)
  if ((index + 1) % Math.floor(Math.random() * 4 + 3) === 0) {
    return true;
  }
  
  // Add breaks before emotionally charged sections
  if (/fear|love|anger|sadness|joy|excitement|anxiety|peace/i.test(s)) {
    return true;
  }
  
  return false;
}

function isMidSentenceCardReveal(sentence: string): boolean {
  // Check if sentence contains a card name but is NOT a standalone card reveal
  // Mid-sentence patterns: "I'm seeing... Seven of Swords." or "boom, The Lovers."
  const containsCard = /(?:The\s+)?(?:Fool|Magician|High\s+Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel\s+of\s+Fortune|Justice|Hanged\s+Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King)(?:\s+of\s+(?:Wands|Cups|Swords|Pentacles))?(?:,\s*reversed)?/i.test(sentence);
  
  if (!containsCard) return false;
  
  // Check if it's a standalone card reveal (card name only, with optional reaction)
  const isStandalone = /^(?:The\s+)?(?:Fool|Magician|High\s+Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel\s+of\s+Fortune|Justice|Hanged\s+Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King)(?:\s+of\s+(?:Wands|Cups|Swords|Pentacles))?(?:,\s*reversed)?[.,]\s*(?:(?:Oh\s+(?:my\s+)?god|Huh\?\?|Hmm?|Whoa|Sheesh|Oh\s+wow)[.!?]?)?\s*$/i.test(sentence.trim());
  
  // If it contains a card but is NOT standalone, it's a mid-sentence reveal
  return !isStandalone;
}

export function applyBreaks(stitched: string): string {
  // Split into paragraphs first to preserve structure
  const paragraphs = stitched.split('\n\n');
  
  // First pass: identify which paragraphs start with card reveals
  const paragraphStartsWithCard: boolean[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      paragraphStartsWithCard.push(false);
      continue;
    }
    
    const sentences = paragraph.trim().split(/(?<=[.!?])\s+/);
    const firstSentence = sentences[0]?.trim() || '';
    
    // Check if first sentence is a standalone card reveal or has mid-sentence card
    const cardRevealPattern = /^(?:The\s+)?(?:Fool|Magician|High\s+Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel\s+of\s+Fortune|Justice|Hanged\s+Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King)(?:\s+of\s+(?:Wands|Cups|Swords|Pentacles))?(?:,\s*reversed)?[.,]/i;
    const hasCard = cardRevealPattern.test(firstSentence);
    paragraphStartsWithCard.push(hasCard);
  }
  
  // Second pass: process paragraphs with card-aware break placement
  const processedParagraphs: string[] = [];
  
  for (let p = 0; p < paragraphs.length; p++) {
    const paragraph = paragraphs[p];
    
    if (!paragraph.trim()) {
      processedParagraphs.push(paragraph);
      continue;
    }
    
    // First normalize any existing breaks in paragraph
    let normalizedParagraph = normalizeExistingBreaks(paragraph.trim());
    
    // Split into sentences for analysis within each paragraph
    const sentences = normalizedParagraph.split(/(?<=[.!?])\s+/);
    
    const resultSentences: string[] = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      resultSentences.push(sentence);
      
      // Check if we're at the end of this paragraph AND the next paragraph starts with a card
      const isLastSentenceInParagraph = i === sentences.length - 1;
      const nextParagraphHasCard = p < paragraphs.length - 1 && paragraphStartsWithCard[p + 1];
      
      if (isLastSentenceInParagraph && nextParagraphHasCard) {
        // Add 3-5s pause before the card reveal in the next paragraph
        const cardRevealPause = Math.random() * 2 + 3;
        resultSentences.push(`<break time="${Math.round(cardRevealPause * 10) / 10}s" />`);
      } 
      // Skip adding breaks after the last sentence (unless it's before a card paragraph)
      else if (i < sentences.length - 1) {
        const nextSentence = sentences[i + 1];
        
        // Check if the NEXT sentence (within same paragraph) is a standalone card reveal
        const cardRevealPattern = /^(?:The\s+)?(?:Fool|Magician|High\s+Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel\s+of\s+Fortune|Justice|Hanged\s+Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King)(?:\s+of\s+(?:Wands|Cups|Swords|Pentacles))?(?:,\s*reversed)?[.,]\s*(?:(?:Oh\s+(?:my\s+)?god|Huh\?\?|Hmm?|Whoa|Sheesh|Oh\s+wow)[.!?]?)?\s*$/i;
        const isNextSentenceCardReveal = cardRevealPattern.test(nextSentence.trim());
        
        // Check if next sentence has a mid-sentence card reveal
        const nextIsMidSentenceCardReveal = isMidSentenceCardReveal(nextSentence);
        
        // Priority 1: If next sentence is a standalone card reveal, add longer pause (3-5s) BEFORE it
        if (isNextSentenceCardReveal) {
          const cardRevealPause = Math.random() * 2 + 3; // 3-5 seconds for sound FX
          resultSentences.push(`<break time="${Math.round(cardRevealPause * 10) / 10}s" />`);
        } 
        // Priority 2: If next sentence is a mid-sentence card reveal, add shorter pause (2-3s) BEFORE it
        else if (nextIsMidSentenceCardReveal) {
          const midCardPause = Math.random() * 1 + 2; // 2-3 seconds for mid-sentence reveals
          resultSentences.push(`<break time="${Math.round(midCardPause * 10) / 10}s" />`);
        }
        // Priority 3: Regular break logic (no card reveal coming next)
        else {
          const shouldAddBreak = shouldAddBreakAfterSentence(sentence, i, sentences.length);
          
          if (shouldAddBreak) {
            const duration = getRandomBreakDuration();
            resultSentences.push(`<break time="${duration}s" />`);
          }
        }
      }
    }
    
    // Join sentences within paragraph with single spaces
    const processedParagraph = resultSentences.join(' ');
    processedParagraphs.push(processedParagraph);
  }
  
  // Join paragraphs with double newlines to preserve structure
  return processedParagraphs.join('\n\n');
}
