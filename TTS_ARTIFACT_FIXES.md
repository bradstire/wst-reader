# TTS Artifact Fixes — Break Combination Sanitizer

**Date**: October 21, 2025  
**Purpose**: Document and fix problematic break combinations that cause TTS glitches/artifacts

---

## Overview

Certain combinations of break lengths and phrases cause glitches or artifacts in ElevenLabs TTS output. This document tracks known issues and the sanitization rules applied to fix them.

---

## Known Problematic Patterns

### **Issue #1: Card Reveal + Reaction + Short Break**

**Problematic Pattern**:
```
The Emperor, upright. <break time="3.8s" /> Oh wow. <break time="1.1s" />
```

**Symptoms**:
- Artifacts/glitches appear after "Oh wow."
- Audio stuttering or distortion
- Unnatural pronunciation

**Root Cause**:
- Medium/long break (3s+) after card reveal
- Followed by short reaction ("Oh wow", "Huh??", "Sheesh", etc.)
- Followed by short break (0.5-2s)
- ElevenLabs has trouble processing this specific combination

**Fix Applied**:
- Detect pattern: `[Card] <break 3s+> [Reaction] <break 0.5-2s>`
- Replace short post-reaction break with **2.5-3.5s** break
- Provides smoother transition, eliminates artifacts

**Fixed Pattern**:
```
The Emperor, upright. <break time="3.8s" /> Oh wow. <break time="2.9s" />
```

---

## Sanitizer Implementation

**Location**: `apply_breaks.py` → `sanitize_break_combinations()`

**Pattern Detection**:
```python
pattern1 = re.compile(
    r'(Card reveal)\s*<break time="([3-9]|1[0-2])s"\s*/>\s*(Reaction)\s*<break time="([0-2])s"\s*/>',
    re.IGNORECASE
)
```

**Replacement Logic**:
- Detect: Long break (3-12s) after card + short break (0-2s) after reaction
- Replace: Short break → Random 2.5-3.5s break
- Preserve: Card reveal text and reaction text unchanged

---

## Reactions Covered

The sanitizer watches for these reaction phrases:
- "Oh wow"
- "Huh??"
- "Sheesh"
- "Whoa"
- "Oh my god"
- "Mm-hm"
- "Hm" / "Hmm"
- (More can be added as discovered)

---

## Card Patterns Covered

All standard tarot cards:
- **Minor Arcana**: "The Ace of Wands", "The Two of Cups", etc.
- **Major Arcana**: "The Fool", "The Magician", "The Tower", etc.
- **With orientation**: "The Fool, reversed" or "The Fool, upright"

---

## Testing & Validation

**How to Test**:
1. Generate a reading with card reveals and reactions
2. Apply breaks using `apply_breaks.py`
3. Generate TTS audio with ElevenLabs
4. Listen for artifacts after reactions following card reveals
5. If found: Document pattern and add to sanitizer

**Expected Result**:
- No glitches after "Oh wow", "Sheesh", etc.
- Smooth transitions throughout
- Natural-sounding pauses

---

## Future Patterns (To Be Added)

As more artifact patterns are discovered during QC, they will be added here:

### **Issue #2**: [To Be Documented]
**Pattern**: 
**Symptoms**: 
**Fix**: 

### **Issue #3**: [To Be Documented]
**Pattern**: 
**Symptoms**: 
**Fix**: 

---

## Reporting New Issues

When you encounter TTS artifacts:

1. **Note the exact text** including break tags
2. **Identify the pattern**:
   - What comes before?
   - Break length?
   - Specific phrase?
   - Break length after?
3. **Document symptoms**: Glitch, stutter, distortion, mispronunciation?
4. **Add to this file** and update sanitizer in `apply_breaks.py`

---

## Sanitizer Logic Flow

```
1. Apply all normal breaks (pre-realization, pre-card, post-sentence)
2. Run sanitize_break_combinations() to fix known problematic patterns
3. Output final text with sanitized breaks
```

---

## Current Sanitization Rules

| Issue # | Pattern | Detection | Fix |
|---------|---------|-----------|-----|
| #1 | Card + Long Break + Reaction + Short Break | Regex match | Replace short break with 2.5-3.5s |

---

## Version History

- **Oct 21, 2025**: Initial sanitizer with Issue #1 (card + reaction artifacts)

---

**File**: `apply_breaks.py`  
**Function**: `sanitize_break_combinations()`  
**Purpose**: Fix known problematic break combinations before TTS generation


