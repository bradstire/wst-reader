#!/usr/bin/env python3
"""
Break Length Ruleset Application Script (WST2 downstream speech gen)

This script applies <break time="Xs" /> tags to a generated tarot reading
according to the weighted distribution rules defined in the break length ruleset.

Usage:
    python3 apply_breaks.py [input_file] [output_file]
    python3 apply_breaks.py --sign <Sign> [input_file]

If no arguments provided, defaults to:
    input:  ./output/FULL_READING.txt
    output: ./output/WHITE_SOUL_TAROT_with_breaks.txt
"""

import re
import random
import argparse
import os
from pathlib import Path
from datetime import datetime

# Break duration ranges and their weighted distribution
# Adjusted to target 15 minute total duration
# Note: Pre-realization (0.5-1s) and pre-card-reveal (1-1.5s) breaks are added separately
# These weights are for general sentence breaks, rebalanced to maintain 15min target
BREAK_RANGES = {
    'micro': {
        'range': (0.5, 2.0),
        'weight': 0.58,  # 58% of breaks (rebalanced with new pre-breaks)
        'description': 'micro-break, breathmark'
    },
    'short': {
        'range': (2.0, 5.0),
        'weight': 0.24,  # 24% of breaks
        'description': 'short reflective break'
    },
    'medium': {
        'range': (5.0, 10.0),
        'weight': 0.11,  # 11% of breaks
        'description': 'medium weight break'
    },
    'extended': {
        'range': (10.0, 12.0),
        'weight': 0.07,  # 7% of breaks
        'description': 'extended break cap'
    }
}

def get_random_break_duration():
    """Generate a random break duration according to the weighted distribution."""
    rand = random.random()
    cumulative_weight = 0
    
    for break_type, config in BREAK_RANGES.items():
        cumulative_weight += config['weight']
        if rand <= cumulative_weight:
            min_duration, max_duration = config['range']
            # Add some randomization within the range
            duration = random.uniform(min_duration, max_duration)
            return round(duration, 1)
    
    # Fallback to micro break
    return round(random.uniform(0.5, 2.0), 1)

def sanitize_break_combinations(text):
    """
    Sanitize problematic break combinations that cause TTS artifacts.
    
    Known Issues:
    1. Card reveal + medium/long break (3s+) + reaction ("Oh wow", etc) + short break (1-2s)
       → Causes glitches after the reaction
       → Fix: Adjust post-reaction break to 2.5-3.5s range
    
    Add new patterns as discovered during QC.
    """
    
    # Pattern 1: Card reveal + medium/long break + reaction + short break
    # Example: "The Emperor, upright. <break time="3.8s" /> Oh wow. <break time="1.1s" />"
    # Fix: Change the break after "Oh wow." to 2.5-3.5s to avoid artifacts
    
    pattern1 = re.compile(
        r'((?:The|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King)\s+(?:of\s+)?(?:Wands|Cups|Swords|Pentacles|Fool|Magician|High Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel of Fortune|Justice|Hanged Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World)(?:,\s+(?:reversed|upright))?\.)\s*<break time="([3-9]|1[0-2])(?:\.\d+)?s"\s*/>\s*((?:Oh wow|Huh\?\?|Sheesh|Whoa|Oh my god|Mm-hm|Hm|Mmm)\.)\s*<break time="([0-2])(?:\.\d+)?s"\s*/>',
        re.IGNORECASE
    )
    
    def replace_pattern1(match):
        card_reveal = match.group(1)
        first_break_time = match.group(2)
        reaction = match.group(3)
        problematic_break_time = match.group(4)
        
        # Replace the short problematic break with a safer 2.5-3.5s break
        safe_break = round(random.uniform(2.5, 3.5), 1)
        
        return f'{card_reveal} <break time="{first_break_time}s" /> {reaction} <break time="{safe_break}s" />'
    
    text = pattern1.sub(replace_pattern1, text)
    
    # Add more patterns here as discovered during QC
    # Pattern 2: [Future pattern]
    # Pattern 3: [Future pattern]
    
    return text

def normalize_existing_breaks(text):
    """Normalize any existing break tags to the standard format."""
    # Match various break tag formats and normalize them
    patterns = [
        r'<break\s+time=["\']([^"\']+)["\']\s*/>',  # <break time="2s" />
        r'<break\s+time=([^\s>]+)\s*/>',           # <break time=2s />
        r'\[break\]',                              # [break]
        r'\[BREAK\]',                              # [BREAK]
        r'<break\s*/>',                            # <break />
    ]
    
    def replace_break(match):
        if 'time=' in match.group(0):
            # Extract existing time value if present
            time_match = re.search(r'time=["\']?([^"\'>\s]+)', match.group(0))
            if time_match:
                time_str = time_match.group(1)
                # Try to parse existing duration
                try:
                    if time_str.endswith('s'):
                        duration = float(time_str[:-1])
                    else:
                        duration = float(time_str)
                    return f'<break time="{duration}s" />'
                except ValueError:
                    pass
        # Generate new random duration
        duration = get_random_break_duration()
        return f'<break time="{duration}s" />'
    
    for pattern in patterns:
        text = re.sub(pattern, replace_break, text, flags=re.IGNORECASE)
    
    return text

def split_header(text: str):
    """If the text begins with the two-line header, split and return (header, body)."""
    if text.startswith('[ZODIAC:'):
        parts = text.split('\n', 3)
        # Expect: [0]=first line, [1]=second line, [2]=blank, [3:]=rest
        if len(parts) >= 4 and parts[1].startswith('[GENERATED_AT:'):
            header = parts[0] + '\n' + parts[1] + '\n\n'
            body = text[len(header):]
            return header, body
    return '', text


def add_breaks_to_text(text):
    """Add break tags throughout the text according to the ruleset."""
    # Preserve header if present
    header, body = split_header(text)

    # First normalize any existing breaks in body
    body = normalize_existing_breaks(body)
    
    # Normalize "Hm." to "Hmm." for better TTS pronunciation
    body = re.sub(r'\bHm\.', 'Hmm.', body)
    
    # Track card names that have been revealed (for first-time reveal detection)
    revealed_cards = set()
    
    # Split into paragraphs first to preserve structure
    paragraphs = body.split('\n\n')
    processed_paragraphs = []
    
    for paragraph in paragraphs:
        if not paragraph.strip():
            processed_paragraphs.append(paragraph)
            continue
            
        # Split into sentences for analysis within each paragraph
        sentences = re.split(r'(?<=[.!?])\s+', paragraph.strip())
        
        result_sentences = []
        
        for i, sentence in enumerate(sentences):
            # Check if this sentence starts with a realization phrase
            realization_match = re.match(r'^(Wait|Hold up|Hold on|I\'m seeing|Hm|Mm)', sentence, re.IGNORECASE)
            if realization_match:
                # Add pre-realization pause (0.5-1 second)
                pre_pause = round(random.uniform(0.5, 1.0), 1)
                result_sentences.append(f'<break time="{pre_pause}s" />')
            
            # Check for first-time card reveal
            card_match = re.search(r'The\s+(?:Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King)\s+of\s+(?:Wands|Cups|Swords|Pentacles)|The\s+(?:Fool|Magician|High Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel of Fortune|Justice|Hanged Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World)(?:,\s+(?:reversed|upright))?', sentence, re.IGNORECASE)
            
            if card_match:
                card_name = card_match.group(0).lower()
                # Only add pre-card pause if this is the first time we see this card
                if card_name not in revealed_cards:
                    revealed_cards.add(card_name)
                    # Add pre-card-reveal pause (2-2.5 seconds) - increased for card flip sound insertion
                    pre_card_pause = round(random.uniform(2.0, 2.5), 1)
                    result_sentences.append(f'<break time="{pre_card_pause}s" />')
            
            result_sentences.append(sentence)
            
            # Skip adding breaks after the last sentence
            if i < len(sentences) - 1:
                # Determine if we should add a break after this sentence
                should_add_break = should_add_break_after_sentence(sentence, i, len(sentences))
                
                if should_add_break:
                    duration = get_random_break_duration()
                    result_sentences.append(f'<break time="{duration}s" />')
        
        # Join sentences within paragraph with single spaces
        processed_paragraph = ' '.join(result_sentences)
        processed_paragraphs.append(processed_paragraph)
    
    # Join paragraphs with double newlines to preserve structure
    processed_body = '\n\n'.join(processed_paragraphs)
    
    # Apply sanitization to fix problematic break combinations
    processed_body = sanitize_break_combinations(processed_body)
    
    return header + processed_body

def should_add_break_after_sentence(sentence, index, total_sentences):
    """Determine if a break should be added after this sentence."""
    sentence = sentence.strip()
    
    # Always add breaks after certain patterns
    if re.search(r'(you know|okay|right\?|alright)', sentence, re.IGNORECASE):
        return True
    
    # Add breaks after card reveals (sentences containing card names)
    if re.search(r'\b(?:The|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King|of|Wands|Cups|Swords|Pentacles|Fool|Magician|High Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|Strength|Hermit|Wheel of Fortune|Justice|Hanged Man|Death|Temperance|Devil|Tower|Star|Moon|Sun|Judgement|World)\b', sentence, re.IGNORECASE):
        return True
    
    # Add breaks after strong declarative statements
    if re.search(r'\.\s*$', sentence) and len(sentence) > 50:
        return True
    
    # Add breaks after laughter markers or parasocial asides
    if re.search(r'(haha|hehe|lol|lmao|oh my|wow|amazing|incredible)', sentence, re.IGNORECASE):
        return True
    
    # Add breaks at narrative pivots (every 3-6 sentences)
    if (index + 1) % random.randint(3, 6) == 0:
        return True
    
    # Add breaks before emotionally charged sections
    if re.search(r'(fear|love|anger|sadness|joy|excitement|anxiety|peace)', sentence, re.IGNORECASE):
        return True
    
    return False

def apply_breaks_to_file(input_file, output_file):
    """Apply break tags to the input file and save to output file."""
    print(f"Reading input file: {input_file}")
    
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"Original content length: {len(content)} characters")
    
    # Apply break tags
    print("Applying break tags according to ruleset...")
    processed_content = add_breaks_to_text(content)
    
    print(f"Processed content length: {len(processed_content)} characters")
    
    # Count break tags
    break_count = len(re.findall(r'<break time="[^"]+"\s*/>', processed_content))
    print(f"Added {break_count} break tags")
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Write output file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(processed_content)
    
    print(f"Break tags applied and saved to: {output_file}")
    
    # Print break distribution summary
    print_break_distribution(processed_content)

def print_break_distribution(content):
    """Print a summary of the break distribution."""
    breaks = re.findall(r'<break time="([^"]+)"\s*/>', content)
    
    if not breaks:
        print("No break tags found in processed content.")
        return
    
    # Categorize breaks by duration
    micro_breaks = 0
    short_breaks = 0
    medium_breaks = 0
    extended_breaks = 0
    
    for break_time in breaks:
        try:
            duration = float(break_time.replace('s', ''))
            if 0.5 <= duration <= 2.0:
                micro_breaks += 1
            elif 2.0 < duration <= 5.0:
                short_breaks += 1
            elif 5.0 < duration <= 10.0:
                medium_breaks += 1
            elif 10.0 < duration <= 12.0:
                extended_breaks += 1
        except ValueError:
            continue
    
    total_breaks = len(breaks)
    
    print(f"\nBreak Distribution Summary:")
    print(f"  Micro breaks (0.5-2s): {micro_breaks} ({micro_breaks/total_breaks*100:.1f}%)")
    print(f"  Short breaks (2-5s): {short_breaks} ({short_breaks/total_breaks*100:.1f}%)")
    print(f"  Medium breaks (5-10s): {medium_breaks} ({medium_breaks/total_breaks*100:.1f}%)")
    print(f"  Extended breaks (10-12s): {extended_breaks} ({extended_breaks/total_breaks*100:.1f}%)")
    print(f"  Total breaks: {total_breaks}")

def iso_now() -> str:
    try:
        return datetime.now().astimezone().isoformat(timespec='seconds')
    except Exception:
        from datetime import datetime as dt
        return dt.utcnow().isoformat(timespec='seconds') + 'Z'


def main():
    parser = argparse.ArgumentParser(description='Apply break tags to tarot reading text')
    parser.add_argument('--sign', dest='sign', help='Zodiac sign for timestamped output naming')
    parser.add_argument('input_file', nargs='?',
                        default='./output/FULL_READING.txt',
                        help='Input file path (default: ./output/FULL_READING.txt)')
    parser.add_argument('output_file', nargs='?',
                        default=None,
                        help='Output file path (default depends on --sign)')
    
    args = parser.parse_args()
    
    try:
        # Determine output path
        output_file = args.output_file
        if output_file is None:
            if args.sign:
                stamp = iso_now().replace(':', '-')
                output_file = f'./output/FULL_READING_with_breaks__{args.sign}__{stamp}.txt'
            else:
                output_file = './output/WHITE_SOUL_TAROT_with_breaks.txt'

        apply_breaks_to_file(args.input_file, output_file)
        print("\nBreak application completed successfully!")
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())
