// Break duration ranges and their weighted distribution (ported from Python)
const BREAK_RANGES = {
  'micro': {
    range: [0.5, 2.0],
    weight: 0.65,  // 65% of breaks
    description: 'micro-break, breathmark'
  },
  'short': {
    range: [2.0, 5.0],
    weight: 0.225,  // 22.5% of breaks
    description: 'short reflective break'
  },
  'medium': {
    range: [5.0, 10.0],
    weight: 0.075,  // 7.5% of breaks
    description: 'medium weight break'
  },
  'extended': {
    range: [10.0, 12.0],
    weight: 0.05,  // 5% of breaks
    description: 'extended break cap'
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
  
  // Always add breaks after certain patterns
  if (/you know|okay|right\?|alright/i.test(s)) {
    return true;
  }
  
  // Add breaks after card reveals (sentences containing card names)
  if (/\b(?:The|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King|of|Wands|Cups|Swords|Pentacles|Fool|Magician|High Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel of Fortune|Justice|Hanged Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World)\b/i.test(s)) {
    return true;
  }
  
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

export function applyBreaks(stitched: string): string {
  // Split into paragraphs first to preserve structure
  const paragraphs = stitched.split('\n\n');
  const processedParagraphs: string[] = [];
  
  for (const paragraph of paragraphs) {
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
      
      // Skip adding breaks after the last sentence
      if (i < sentences.length - 1) {
        // Determine if we should add a break after this sentence
        const shouldAddBreak = shouldAddBreakAfterSentence(sentence, i, sentences.length);
        
        if (shouldAddBreak) {
          const duration = getRandomBreakDuration();
          resultSentences.push(`<break time="${duration}s" />`);
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
