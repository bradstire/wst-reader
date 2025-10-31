#!/usr/bin/env node

/**
 * Text QC Pass: Reduce "energy" overuse, fix fragments, trim repetition
 * 
 * Requirements:
 * - Reduce "energy" usage by ~66% (cap at ≤10)
 * - Fix grammar fragments ("there the" → "there's the", etc.)
 * - Trim "You knew before you said it" to ≤3 uses
 * - Idempotent (re-running makes no further changes)
 * - Dry-run mode with unified diff
 * - Unit checks for counts before/after
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const INPUT_DIR = path.join(__dirname, '../output');
const BACKUP_DIR = path.join(__dirname, '../output/qc-backup');

// Synonyms for "energy" (rotated for variety)
const ENERGY_SYNONYMS = [
  'influence',
  'current',
  'undertone',
  'vibe',
  'presence',
  'pull',
  'mood',
  'charge',
  'force',
  'undercurrent'
];

function countWord(text, word) {
  const regex = new RegExp(`\\b${word}\\b`, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function reduceEnergyUsage(text) {
  const energyCount = countWord(text, 'energy');
  
  if (energyCount <= 10) {
    return text;
  }
  
  const targetCount = 10;
  let remaining = energyCount - targetCount;
  let synonymIndex = 0;
  let keepCount = 0;
  
  // Find all occurrences across the whole text
  const regex = /\benergy\b/gi;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      before: text.substring(Math.max(0, match.index - 50), match.index),
      after: text.substring(match.index, Math.min(text.length, match.index + 100))
    });
  }
  
  // Mark which ones to keep (compound phrases and first few occurrences)
  const toKeep = new Set();
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const isCompound = /\b(?:Sun|solar|positive|negative|yin|yang|chaotic|still)\s+$/i.test(match.before);
    const isEarly = i < 5; // Keep first 5 to preserve some natural usage
    
    if (isCompound || isEarly) {
      toKeep.add(i);
      keepCount++;
    }
  }
  
  // Replace from the end to preserve indices
  let result = text;
  for (let i = matches.length - 1; i >= 0 && remaining > 0; i--) {
    if (toKeep.has(i)) {
      continue;
    }
    
    const match = matches[i];
    const before = result.substring(0, match.index);
    const after = result.substring(match.index + 6); // 6 = length of "energy"
    
    let synonym = ENERGY_SYNONYMS[synonymIndex % ENERGY_SYNONYMS.length];
    
    // Context-specific synonyms
    const surrounding = match.before + match.after;
    if (/underneath|beneath|under the surface/i.test(surrounding)) {
      synonym = 'undertone';
    } else if (/casual|feeling/i.test(surrounding)) {
      synonym = 'vibe';
    } else if (/flowing|moving|momentum|direction/i.test(surrounding)) {
      synonym = 'current';
    } else if (/pulling|drawing|attracting/i.test(surrounding)) {
      synonym = 'pull';
    }
    
    result = before + synonym + after;
    synonymIndex++;
    remaining--;
  }
  
  return result;
}

function fixGrammarFragments(text) {
  let fixed = 0;
  let result = text;
  
  const fragmentFixes = [
    { pattern: /\bthere the\b/gi, replacement: 'there\'s the' },
    { pattern: /\bthere that\b/gi, replacement: 'there\'s that' },
    { pattern: /\bthere a /g, replacement: 'there\'s a ' },
    { pattern: /\bthere an /g, replacement: 'there\'s an ' },
    { pattern: /you knew there ([a-z]+)\b/gi, replacement: (match, p1) => {
      fixed++;
      return `you knew it was ${p1}`;
    }},
    { pattern: /\bthere like\b/gi, replacement: 'it\'s like' },
    { pattern: /\bthere hanging\b/gi, replacement: 'it\'s hanging' },
    { pattern: /\bthere holding\b/gi, replacement: 'that\'s holding' },
    { pattern: /\bthe ['"]this energy['"] energy\b/gi, replacement: 'the influence' },
  ];
  
  for (const fix of fragmentFixes) {
    const before = result;
    result = result.replace(fix.pattern, fix.replacement);
    if (result !== before) {
      fixed++;
    }
  }
  
  // Preserve capitalization at sentence starts
  result = result.replace(/there\'s ([A-Z])/g, (match, letter) => {
    return `There's ${letter}`;
  });
  
  return fixed;
}

function trimRepetition(text) {
  const phrase = 'you knew before you said it';
  const count = countWord(text, phrase);
  
  if (count <= 3) {
    return text;
  }
  
  const lines = text.split('\n');
  const occurrences = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    let match;
    while ((match = regex.exec(line)) !== null) {
      occurrences.push({
        line: i,
        index: match.index,
        text: line
      });
    }
  }
  
  const toRemove = occurrences.slice(1, occurrences.length - 1);
  if (toRemove.length === 0 && count > 3) {
    return text;
  }
  
  const variants = [
    'You felt this before you said it.',
    'Be honest—you clocked this already.',
    'You saw this coming.',
  ];
  
  for (let i = 0; i < toRemove.length && count > 3; i++) {
    const occ = toRemove[i];
    const variant = variants[i % variants.length];
    lines[occ.line] = lines[occ.line].replace(new RegExp(`\\b${phrase}\\b`, 'gi'), variant);
  }
  
  return lines.join('\n');
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  
  const stats = {
    filename: path.basename(filePath),
    energyBefore: countWord(original, 'energy'),
    energyAfter: 0,
    phraseBefore: countWord(original, 'you knew before you said it'),
    phraseAfter: 0,
    fragmentsFixed: 0,
  };
  
  let processed = original;
  
  // Apply fixes in order
  processed = reduceEnergyUsage(processed);
  stats.fragmentsFixed = fixGrammarFragments(processed);
  processed = trimRepetition(processed);
  
  stats.energyAfter = countWord(processed, 'energy');
  stats.phraseAfter = countWord(processed, 'you knew before you said it');
  
  // Only write if there were changes
  if (processed !== original) {
    if (!DRY_RUN) {
      // Create backup directory
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      
      // Write backup
      const backupPath = path.join(BACKUP_DIR, stats.filename);
      fs.writeFileSync(backupPath, original);
      
      // Write updated file
      fs.writeFileSync(filePath, processed);
    }
    return stats;
  }
  
  return null;
}

function main() {
  console.log(`Running QC cleanup ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}...`);
  
  const files = fs.readdirSync(INPUT_DIR)
    .filter(f => f.endsWith('.txt') && !f.includes('_backup'))
    .map(f => path.join(INPUT_DIR, f));
  
  const stats = [];
  
  for (const file of files) {
    const fileStats = processFile(file);
    if (fileStats) {
      stats.push(fileStats);
    }
  }
  
  console.log('\n=== QC CLEANUP SUMMARY ===\n');
  if (stats.length === 0) {
    console.log('No files needed changes.');
    return;
  }
  
  console.log('Filename'.padEnd(50) + 'energy'.padEnd(15) + 'phrase'.padEnd(15) + 'fragments');
  console.log('-'.repeat(100));
  
  for (const stat of stats) {
    const energyChange = `${stat.energyBefore} → ${stat.energyAfter}`.padEnd(15);
    const phraseChange = `${stat.phraseBefore} → ${stat.phraseAfter}`.padEnd(15);
    console.log(
      stat.filename.padEnd(50) +
      energyChange +
      phraseChange +
      stat.fragmentsFixed
    );
  }
  
  if (!DRY_RUN) {
    console.log('\nBackups saved to:', BACKUP_DIR);
  }
}

main();

