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
BREAK_RANGES = {
    'micro': {
        'range': (0.5, 2.0),
        'weight': 0.65,  # 65% of breaks
        'description': 'micro-break, breathmark'
    },
    'short': {
        'range': (2.0, 5.0),
        'weight': 0.225,  # 22.5% of breaks
        'description': 'short reflective break'
    },
    'medium': {
        'range': (5.0, 10.0),
        'weight': 0.075,  # 7.5% of breaks
        'description': 'medium weight break'
    },
    'extended': {
        'range': (10.0, 12.0),
        'weight': 0.05,  # 5% of breaks
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

def adjust_break_durations(content):
    """
    Adjust break durations in existing content according to new rules:
    - Breaks > 4s → 3.0-4.0s (unless between paragraphs)
    - Paragraph breaks → 4.0-8.0s (max 4-5 per reading)
    - Short breaks 0.5-1.0s → 1.2-1.8s (for better pacing)
    """
    # Track paragraph breaks for limiting long pauses
    paragraph_break_count = 0
    max_paragraph_breaks = random.randint(4, 5)
    
    def adjust_break(match):
        nonlocal paragraph_break_count
        
        # Extract the full match and the duration value
        full_match = match.group(0)
        time_str = match.group(1)
        
        # Parse current duration
        try:
            current_duration = float(time_str.replace('s', ''))
        except ValueError:
            return full_match  # Keep original if can't parse
        
        # Get the position of this break in the text
        pos = match.start()
        
        # Check if this is a paragraph break (has blank line before or after)
        # Look back and forward in the content
        before_break = content[:pos].rstrip()
        after_break = content[pos + len(full_match):].lstrip()
        
        # Check if there's a paragraph boundary (double newline) nearby
        is_paragraph_break = (before_break.endswith('\n\n') or 
                             after_break.startswith('\n\n') or
                             '\n\n' in before_break[-20:] or
                             '\n\n' in after_break[:20])
        
        # Apply adjustment rules
        if is_paragraph_break and paragraph_break_count < max_paragraph_breaks:
            # Allow longer paragraph breaks (4.0-8.0s) for first 4-5 occurrences
            if current_duration > 4.0:
                # Keep it but constrain to 4.0-8.0s range
                new_duration = random.uniform(4.0, 8.0)
                paragraph_break_count += 1
            else:
                # Increase to paragraph break range
                new_duration = random.uniform(4.0, 6.0)
                paragraph_break_count += 1
        elif current_duration > 4.0:
            # Reduce long breaks that aren't paragraph breaks to 3.0-4.0s
            new_duration = random.uniform(3.0, 4.0)
        elif 0.5 <= current_duration <= 1.0:
            # Slightly increase very short breaks for better pacing
            new_duration = random.uniform(1.2, 1.8)
        else:
            # Keep breaks in the 1.0-4.0s range as-is (with slight variation)
            new_duration = current_duration + random.uniform(-0.2, 0.2)
            new_duration = max(0.5, min(4.0, new_duration))  # Clamp to reasonable range
        
        return f'<break time="{round(new_duration, 1)}s" />'
    
    # Find and replace all break tags
    adjusted_content = re.sub(
        r'<break\s+time=["\']([^"\']+)["\']\s*/>',
        adjust_break,
        content
    )
    
    return adjusted_content

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
    
    # Adjust break durations according to new rules
    print("Adjusting break durations for better pacing...")
    processed_content = adjust_break_durations(processed_content)
    
    print(f"Processed content length: {len(processed_content)} characters")
    
    # Count break tags
    break_count = len(re.findall(r'<break time="[^"]+"\s*/>', processed_content))
    print(f"Total break tags: {break_count}")
    
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
