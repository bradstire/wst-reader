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

function adjustBreakDurations(content: string): string {
  /**
   * Adjust break durations in existing content according to new rules:
   * - Breaks > 4s → 3.0-4.0s (unless between paragraphs)
   * - Paragraph breaks → 4.0-8.0s (max 4-5 per reading)
   * - Short breaks 0.5-1.0s → 1.2-1.8s (for better pacing)
   */
  let paragraphBreakCount = 0;
  const maxParagraphBreaks = Math.floor(Math.random() * 2) + 4; // 4-5
  
  const adjustBreak = (match: string, timeStr: string, offset: number): string => {
    // Parse current duration
    let currentDuration: number;
    try {
      currentDuration = parseFloat(timeStr.replace('s', ''));
    } catch (e) {
      return match; // Keep original if can't parse
    }
    
    // Check if this is a paragraph break (has blank line before or after)
    const beforeBreak = content.substring(0, offset).trimEnd();
    const afterBreak = content.substring(offset + match.length).trimStart();
    
    // Check if there's a paragraph boundary (double newline) nearby
    const isParagraphBreak = (
      beforeBreak.endsWith('\n\n') ||
      afterBreak.startsWith('\n\n') ||
      beforeBreak.slice(-20).includes('\n\n') ||
      afterBreak.slice(0, 20).includes('\n\n')
    );
    
    let newDuration: number;
    
    // Apply adjustment rules
    if (isParagraphBreak && paragraphBreakCount < maxParagraphBreaks) {
      // Allow longer paragraph breaks (4.0-8.0s) for first 4-5 occurrences
      if (currentDuration > 4.0) {
        // Keep it but constrain to 4.0-8.0s range
        newDuration = Math.random() * 4.0 + 4.0;
        paragraphBreakCount++;
      } else {
        // Increase to paragraph break range
        newDuration = Math.random() * 2.0 + 4.0;
        paragraphBreakCount++;
      }
    } else if (currentDuration > 4.0) {
      // Reduce long breaks that aren't paragraph breaks to 3.0-4.0s
      newDuration = Math.random() * 1.0 + 3.0;
    } else if (currentDuration >= 0.5 && currentDuration <= 1.0) {
      // Slightly increase very short breaks for better pacing
      newDuration = Math.random() * 0.6 + 1.2;
    } else {
      // Keep breaks in the 1.0-4.0s range as-is (with slight variation)
      newDuration = currentDuration + (Math.random() * 0.4 - 0.2);
      newDuration = Math.max(0.5, Math.min(4.0, newDuration)); // Clamp to reasonable range
    }
    
    return `<break time="${Math.round(newDuration * 10) / 10}s" />`;
  };
  
  // Find and replace all break tags
  return content.replace(
    /<break\s+time=["']([^"']+)["']\s*\/>/g,
    adjustBreak
  );
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
  let result = processedParagraphs.join('\n\n');
  
  // Adjust break durations for better pacing
  result = adjustBreakDurations(result);
  
  return result;
}
