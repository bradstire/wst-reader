# Break Logic Update — Strategic Pre-Breaks

**Date**: October 21, 2025  
**Version**: Updated break insertion logic  
**Target Duration**: 15 minutes

---

## Summary

Updated `apply_breaks.py` to add strategic pauses **BEFORE** key moments (realizations and card reveals) for better dramatic timing and listener anticipation.

---

## Key Changes

### 1. **Pre-Realization Breaks** (NEW)

**Trigger Phrases**:
- "Wait"
- "Hold up"
- "Hold on"
- "I'm seeing"
- "Hm"
- "Mm"

**Pause Duration**: **0.5-1.0 seconds** (randomly selected)

**Placement**: Immediately BEFORE the realization phrase

**Example**:
```
...you just hoped it wouldn't get this loud. <break time="0.7s" /> Wait—no, that's not it.
```

**Impact**: Creates anticipation and natural processing moment before Angela shifts direction or makes a discovery.

---

### 2. **Pre-Card-Reveal Breaks** (NEW)

**Trigger**: First-time mention of any card name

**Pause Duration**: **1.0-1.5 seconds** (randomly selected)

**Placement**: Immediately BEFORE the card name

**Tracking**: Script tracks which cards have been revealed to ensure pause only on **first mention**, not subsequent references.

**Example**:
```
Okay so I'm seeing... <break time="1.3s" /> The Magician. Upright. Whoa.
```

**Impact**: Builds suspense and marks the dramatic reveal of each new card.

**Note**: If the same card is mentioned later in the reading, NO pre-pause is added (only first reveal gets the dramatic pause).

---

### 3. **Rebalanced General Break Weights**

Since we're adding extra breaks (pre-realization and pre-card), the general sentence break weights were slightly adjusted to maintain the 15-minute target without over-extending.

**New Weights**:
- Micro (0.5-2s): **58%** (up from 55%)
- Short (2-5s): **24%** (down from 25%)
- Medium (5-10s): **11%** (down from 12%)
- Extended (10-12s): **7%** (down from 8%)

**Rationale**: 
- Pre-realization and pre-card breaks add ~10-20 extra short pauses per reading
- Slightly reduce medium/extended weights to compensate
- Increase micro slightly to maintain natural flow
- Result: Still targets ~15 minutes total

---

## Break Insertion Order

For each sentence, the script now:

1. **Check for realization phrase** at start
   - If found: Insert 0.5-1s pre-break

2. **Check for first-time card reveal**
   - If found and not yet revealed: Insert 1-1.5s pre-break
   - Track card name to prevent duplicate pre-breaks

3. **Add the sentence itself**

4. **Check if post-sentence break needed** (existing logic)
   - If yes: Insert random break per weighted distribution

---

## Examples

### Pre-Realization Break

**Before**:
```
You saw it coming. Wait—no, that's not it.
```

**After**:
```
You saw it coming. <break time="0.8s" /> Wait—no, that's not it.
```

---

### Pre-Card-Reveal Break (First Time)

**Before**:
```
Okay so I'm seeing... The Fool. Oh wow.
```

**After**:
```
Okay so I'm seeing... <break time="1.2s" /> The Fool. Oh wow.
```

---

### No Pre-Break (Subsequent Mention)

**Before**:
```
The Fool isn't here to sugarcoat anything.
```

**After**:
```
The Fool isn't here to sugarcoat anything. <break time="1.3s" />
```

(Regular post-sentence break only, no pre-break since "The Fool" was already revealed)

---

## Card Tracking Logic

**Supported Card Patterns**:
- Minor Arcana: "The Ace of Wands", "The Two of Cups", etc.
- Major Arcana: "The Fool", "The Magician", "The Tower", etc.
- With orientation: "The Fool, reversed" or "The Fool, upright"

**Normalization**: Card names are stored lowercase for consistent tracking

**First Mention Only**: Each unique card gets ONE pre-reveal pause, no matter how many times it's referenced later

---

## Testing

To test the new break logic:

1. Generate a reading at http://localhost:3000
2. Apply breaks using the script:
   ```bash
   python3 apply_breaks.py input.txt output_with_breaks.txt
   ```
3. Look for:
   - Pre-pauses before "Wait", "Hold up", "I'm seeing", etc.
   - Pre-pauses before first card reveals (The Fool, The Tower, etc.)
   - NO pre-pauses before second+ mentions of same cards
   - Total duration ~15 minutes

---

## Expected Break Count

For a typical ~3,500-4,200 word reading:
- **General sentence breaks**: ~80-100 (existing logic)
- **Pre-realization breaks**: ~8-15 (new)
- **Pre-card-reveal breaks**: ~5-7 (new, one per card + clarifiers)
- **Total breaks**: ~95-125
- **Total duration**: ~15 minutes

---

## Implementation Details

**Key Code Changes**:

1. **Card tracking**:
   ```python
   revealed_cards = set()
   ```

2. **Pre-realization detection**:
   ```python
   realization_match = re.match(r'^(Wait|Hold up|Hold on|I\'m seeing|Hm|Mm)', sentence, re.IGNORECASE)
   if realization_match:
       pre_pause = round(random.uniform(0.5, 1.0), 1)
       result_sentences.append(f'<break time="{pre_pause}s" />')
   ```

3. **Pre-card-reveal detection** (first time only):
   ```python
   if card_match:
       card_name = card_match.group(0).lower()
       if card_name not in revealed_cards:
           revealed_cards.add(card_name)
           pre_card_pause = round(random.uniform(1.0, 1.5), 1)
           result_sentences.append(f'<break time="{pre_card_pause}s" />')
   ```

---

## Version History

- **Oct 21, 2025**: Added strategic pre-breaks for realizations and card reveals
- **Oct 21, 2025**: Adjusted weights to target 14-15 minutes (from 11 minutes)
- **Earlier**: Initial break logic implementation

---

**File**: `apply_breaks.py`  
**Target Duration**: 15 minutes  
**Key Features**: Pre-realization pauses, pre-card-reveal pauses, first-time tracking

