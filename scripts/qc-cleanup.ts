#!/usr/bin/env ts-node

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

import * as fs from 'fs';
import * as path from 'path';

interface QCStats {
  filename: string;
  energyBefore: number;
  energyAfter: number;
  phraseBefore: number;
  phraseAfter: number;
  fragmentsFixed: number;
}

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

function countWord(text: string, word: string): number {
  const regex = new RegExp(`\\b${word}\\b`, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function reduceEnergyUsage(text: string): string {
  let result = text;
  const energyCount = countWord(result, 'energy');
  
  if (energyCount <= 10) {
    return result; // Already at target
  }
  
  let targetCount = 10;
  let currentCount = energyCount;
  let synonymIndex = 0;
  
  // Keep first occurrence per paragraph and any compound phrases
  const sentences = result.split(/(?<=[.!?])\s+/);
  let alreadyKept = new Set<number>();
  
  // First, identify sentences with "energy" to keep
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const hasEnergy = /\benergy\b/i.test(sentence);
    
    if (hasEnergy && currentCount > targetCount) {
      // Keep first occurrence in paragraph OR if it's part of a compound phrase
      const isCompound = /\b(?:Sun|solar|positive|negative|yin|yang|chaotic|still)\s+(?:energy|energies)\b/i.test(sentence);
      const isFirstInParagraph = i === 0 || /\n\n/.test(sentences.slice(0, i).join(' '));
      
      if (isCompound || isFirstInParagraph) {
        alreadyKept.add(i);
        currentCount--;
        continue;
      }
    }
  }
  
  // Now replace the rest
  for (let i = 0; i < sentences.length; i++) {
    if (alreadyKept.has(i) || currentCount <= targetCount) {
      continue;
    }
    
    const sentence = sentences[i];
    if (/\benergy\b/i.test(sentence)) {
      // Choose synonym based on context
      let synonym = ENERGY_SYNONYMS[synonymIndex % ENERGY_SYNONYMS.length];
      
      // Context-specific synonyms
      if (/underneath|beneath|under the surface/i.test(sentence)) {
        synonym = 'undertone';
      } else if (/casual|vibe|feeling/i.test(sentence)) {
        synonym = 'vibe';
      } else if (/flowing|moving|momentum|direction/i.test(sentence)) {
        synonym = 'current';
      } else if (/pulling|drawing|attracting/i.test(sentence)) {
        synonym = 'pull';
      }
      
      sentences[i] = sentence.replace(/\benergy\b/gi, synonym);
      synonymIndex++;
      currentCount--;
    }
  }
  
  result = sentences.join(' ');
  return result;
}

function fixGrammarFragments(text: string): number {
  let fixed = 0;
  let result = text;
  
  const fragmentFixes = [
    { pattern: /\bthere the\b/gi, replacement: 'there\'s the', description: 'there the' },
    { pattern: /\bthere that\b/gi, replacement: 'there\'s that', description: 'there that' },
    { pattern: /\bthere a /g, replacement: 'there\'s a ', description: 'there a' },
    { pattern: /\bthere an /g, replacement: 'there\'s an ', description: 'there an' },
    { pattern: /you knew there ([a-z]+)\b/gi, replacement: (match: string, p1: string) => {
      fixed++;
      return `you knew it was ${p1}`;
    }, description: 'You knew there [adj/noun]' },
    { pattern: /\bthere like\b/gi, replacement: 'it\'s like', description: 'there like' },
    { pattern: /\bthere hanging\b/gi, replacement: 'it\'s hanging', description: 'there hanging' },
    { pattern: /\bthere holding\b/gi, replacement: 'that\'s holding', description: 'there holding' },
    { pattern: /\bthe ['"]this energy['"] energy\b/gi, replacement: 'the influence', description: 'template double energy' },
  ];
  
  for (const fix of fragmentFixes) {
    const before = result;
    result = result.replace(fix.pattern, fix.replacement as any);
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

function trimRepetition(text: string): string {
  const phrase = 'You knew before you said it';
  const count = countWord(text, phrase);
  
  if (count <= 3) {
    return text; // Already at target
  }
  
  // Find all occurrences with indices
  const lines = text.split('\n');
  const occurrences: { line: number; index: number; text: string }[] = [];
  
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
  
  // Keep first and last, remove middle ones
  const toRemove = occurrences.slice(1, occurrences.length - 1);
  if (toRemove.length === 0 && count > 3) {
    // If only 2 occurrences but count > 3, check for case-insensitive duplicates
    // This handles the case where we have variations
    return text;
  }
  
  // Replace mid-body occurrences with variants
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

function processFile(filePath: string): QCStats | null {
  const original = fs.readFileSync(filePath, 'utf8');
  
  const stats: QCStats = {
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

function generateDiff(original: string, modified: string): string {
  // Simple unified diff generation
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  
  let diff = '';
  let i = 0, j = 0;
  
  while (i < origLines.length || j < modLines.length) {
    if (i >= origLines.length) {
      diff += `+${modLines[j]}\n`;
      j++;
    } else if (j >= modLines.length) {
      diff += `-${origLines[i]}\n`;
      i++;
    } else if (origLines[i] === modLines[j]) {
      diff += ` ${origLines[i]}\n`;
      i++;
      j++;
    } else {
      // Find next match
      let found = false;
      for (let k = j + 1; k < Math.min(modLines.length, j + 10); k++) {
        if (origLines[i] === modLines[k]) {
          // Lines between j and k are additions
          for (let l = j; l < k; l++) {
            diff += `+${modLines[l]}\n`;
          }
          j = k;
          found = true;
          break;
        }
      }
      
      if (!found) {
        diff += `-${origLines[i]}\n`;
        i++;
      }
    }
  }
  
  return diff;
}

function main() {
  console.log(`Running QC cleanup ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}...`);
  
  const files = fs.readdirSync(INPUT_DIR)
    .filter(f => f.endsWith('.txt') && !f.includes('_backup'))
    .map(f => path.join(INPUT_DIR, f));
  
  const stats: QCStats[] = [];
  const changes: { filename: string; diff: string }[] = [];
  
  for (const file of files) {
    if (DRY_RUN) {
      const original = fs.readFileSync(file, 'utf8');
      const stats = processFile(file);
      if (stats) {
        changes.push({
          filename: stats.filename,
          diff: generateDiff(original, fs.readFileSync(file, 'utf8'))
        });
      }
    } else {
      const fileStats = processFile(file);
      if (fileStats) {
        stats.push(fileStats);
      }
    }
  }
  
  if (DRY_RUN) {
    console.log('\n=== DRY RUN SUMMARY ===\n');
    console.log('Files that would be modified:', changes.length);
    
    if (changes.length > 0) {
      console.log('\n=== UNIFIED DIFF ===');
      for (const change of changes) {
        console.log(`\n--- ${change.filename}`);
        console.log(change.diff);
      }
    }
  } else {
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
    
    console.log('\nBackups saved to:', BACKUP_DIR);
  }
}

main();

