# Migration to 6-Chapter Structure

## Overview
We've restructured the reading system from 7 chapters to 6 chapters to hit the 25k word target more efficiently.

## Key Changes

### Structure
**Old (7 chapters):**
- CH01–CH05: Card reveals
- CH06: Callback chapter (no new cards)
- CH07: Closer with CTA

**New (6 chapters):**
- CH01–CH05: Card reveals (5 total)
- CH06: Closer with CTA (no new cards)

### Targets
**Old:**
- 1200–1500 words per chapter
- 6,200 words total (minimum 1000 per chapter)

**New:**
- ~25,000 words total across 6 chapters (~4,200 per chapter)
- Length mentions reduced by 20-30% in prompts
- Emphasis on filler strategies rather than specific word counts

### Files Changed

#### System Instructions
- `/lib/prompts/angelCoreV5_clean.txt`:
  - Updated to 6-chapter structure
  - Removed specific word count targets (reduced length mentions by ~25%)
  - Updated all references from CH07 → CH06
  - Updated all "X/07" → "X/06"

#### Template Files
All template files updated:
- `templates/01.txt` → CHAPTER 01/06
- `templates/02.txt` → CHAPTER 02/06
- `templates/03.txt` → CHAPTER 03/06
- `templates/04.txt` → CHAPTER 04/06
- `templates/05.txt` → CHAPTER 05/06
- `templates/07.txt` → CHAPTER 06/06 (closer)
- `templates/callback.txt` → **DEPRECATED** (delete from git)

#### Changes in Each Template
1. Removed `[LEN: target 1200–1500]` line
2. Changed chapter numbering (X/07 → X/06)
3. Updated RUNTIME GOVERNOR sections:
   - **Old:** "Hit ≥1200 words before the end marker; target 1200–1500 with filler strategies..."
   - **New:** "Extend with filler strategies..."
4. Updated OUTPUT FORMAT references:
   - **Old:** "Silently print the two bracketed lines above ([STATE:], [LEN:]) at the very top."
   - **New:** "Silently print [STATE:] at the very top."
5. Updated [BEGIN CHAPTER X/07...] → [BEGIN CHAPTER X/06...]

### Git Actions Required

```bash
# Remove the deprecated callback.txt file
git rm templates/callback.txt

# Stage and commit all changes
git add lib/prompts/angelCoreV5_clean.txt
git add lib/prompts/angelCoreV5_clean.ts
git add lib/prompts/ANGEL_V5_CHANGELOG.md
git add templates/01.txt templates/02.txt templates/03.txt templates/04.txt templates/05.txt templates/07.txt
git add MIGRATION_TO_6_CHAPTERS.md

git commit -m "Restructure to 6-chapter format for 25k word target

- Remove callback.txt chapter (CH06)
- Update all templates to X/06 structure
- Reduce length mentions by 20-30%
- Update angelCoreV5_clean.txt system instructions
- CH06 is now the closer with CTA (was CH07)"
```

### Code Updates Required

If `generate_prompts.py` or `lib/generate.ts` have hardcoded chapter logic:

1. **Update loop counters:**
   ```python
   # Old:
   for ch_num in range(1, 8):  # 1-7
   
   # New:
   for ch_num in range(1, 7):  # 1-6
   ```

2. **Update callback logic:**
   ```python
   # Old:
   if ch_num == 6:
       template = load_template("callback.txt")
   elif ch_num == 7:
       template = load_template("07.txt")
   
   # New:
   if ch_num == 6:
       template = load_template("07.txt")  # This is now the closer
   ```

3. **Update chapter references in any config files:**
   - Change max_chapters from 7 → 6
   - Update any "callback" references to point to CH06 (closer)

### Testing Checklist

- [ ] Generate a full 6-chapter reading
- [ ] Verify CH01-CH05 each reveal exactly one card
- [ ] Verify CH06 has no new cards and includes CTA
- [ ] Verify no references to "CH07" appear in output
- [ ] Verify total word count targets ~25k
- [ ] Verify metaphor caps (≤2 per chapter) are enforced
- [ ] Verify no explicit word count requirements appear in output

### Expected Behavior

**CH01:**
- Opens with "Hey [Sign]!" greeting
- Optional date/time anchor
- Reveals Card 1

**CH02-CH05:**
- Card name as first line
- Optional reaction (rotate variety)
- Riff on that card only

**CH06:**
- No new cards
- Continues riff from prior chapters
- Vague callbacks (no "Remember when...")
- CTA at end ("Like + Subscribe" + "Tell your group chat")
- No card roll-call or recap

### Backward Compatibility

This is a **breaking change**. Old 7-chapter readings will not work with the new system without regeneration.

To generate legacy 7-chapter readings:
1. Check out the previous git commit
2. Use the old templates
3. Regenerate from scratch

### Benefits of 6-Chapter Structure

1. **Cleaner flow:** Eliminates redundant callback chapter
2. **More focused:** Each chapter has clear purpose
3. **Easier to hit targets:** 6 chapters × 4,200 words = 25,200 words (closer to target)
4. **Reduced complexity:** Simpler chapter numbering and template management
5. **Better pacing:** Removes the "filler" feeling of separate callback chapter

## Questions?

If you encounter issues:
1. Check that all templates are updated to X/06 format
2. Verify callback.txt has been removed from git
3. Ensure angelCoreV5_clean.txt is loaded (not angelCoreV5.txt)
4. Check that any hardcoded chapter loops use range(1, 7) not range(1, 8)

