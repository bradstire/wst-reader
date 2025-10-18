# System Instructions Audit - V5 (6-Chapter Format)

**Date:** October 16, 2025  
**Structure:** CH01 → CH02 → CH03 → CH04 → CH05 → CH07 (callback chapter removed)  
**Target Length:** 1200–1500 words per chapter (down from 1200+ minimum)

---

## 🎯 EXECUTIVE SUMMARY

### ✅ Strengths
- **Consistent metaphor governance** across all templates
- **Strong personality guardrails** (Angela voice, parasocial, surgical)
- **Unified output rules** (no [STATE:], [LEN:] to audience)
- **Reaction rotation** prevents repetition across chapters
- **Job quota** system (max 2 mentions across reading)
- **Zodiac % guidelines** vary appropriately by chapter

### ⚠️ Issues Found

#### **CRITICAL**
1. **CH07 contains duplicate instructions** - Lines 1-135 repeat, then lines 136-237 appear to be CH06 content
2. **Chapter numbering confusion** - File is `07.txt` but contains both CH07 and CH06 instructions
3. **Conflicting closer rules** in CH07 - Says "CTA required" but also has CH06's closer rules
4. **Missing CH06 template** - Callback chapter was deleted, but CH07 still references "CH06" context

#### **MODERATE**
5. **Length targets unchanged** - Still 1200–1500 words per chapter; may need reduction for streamlining
6. **Reaction rotation unclear** - Says "rotate across chapters" but no system to track
7. **Job quota** - Good system, but no mechanism to enforce across sequential chapter generation
8. **Zodiac % varies** but rationale unclear (CH01: 40%, CH02-05: 10%, CH07: 50%)

#### **MINOR**
9. **Tiered filter examples** repeated verbatim across all templates (could be centralized)
10. **Some banned phrases** appear in "safe clichés" list ("like the universe giving you a nudge" uses "like...")
11. **CH01 capitalization instruction** appears twice (lines 82, 141)
12. **[FINAL SELF-CHECK]** section is empty in most templates

---

## 📋 DETAILED FINDINGS

### 1. ⚠️ **CRITICAL: CH07 Duplication & Confusion**

**File:** `templates/07.txt`

**Problem:** The file contains TWO complete sets of instructions:
- Lines 1-135: CH07 instructions (CTA, finale, callbacks)
- Lines 136-237: CH06 instructions (mid-riff, no CTA, continuity)

**Evidence:**
```
Line 81: [GOAL] Continue the riff; NO synthesis, no recap...
Line 88: • CTA required: "Like + Subscribe" (~90%)

[Then later...]

Line 136: [OUTPUT RULES]
Line 137: - No new cards in CH06; do not reveal or hint at unrevealed cards.
Line 139: - No CTA of any kind in CH06.
```

**Impact:** The model receives contradictory instructions. It's told to:
- Include CTA (CH07 rules)
- NOT include CTA (CH06 rules)
- Be the finale (CH07)
- Be a mid-riff callback (CH06)

**Recommendation:** Since callback chapter was removed, **delete lines 136-237** and keep only the CH07 instructions (lines 1-135).

---

### 2. ⚠️ **CRITICAL: Missing CH06 Context**

**Problem:** You deleted `templates/callback.txt` to remove CH06, but:
- CH07 references "CH06" context multiple times
- The reading structure is now: CH01 → CH02 → CH03 → CH04 → CH05 → **[gap]** → CH07

**Evidence from CH07:**
```
Line 233: [BEGIN CHAPTER XX/07 NOW — Callback / Riff only]
```
The "XX" suggests this was meant to be flexible numbering.

**Questions:**
- Is CH07 still meant to be the 7th chapter (with a gap)?
- Or should it be renumbered to CH06?
- Should CH07 still reference previous "callback" energy that no longer exists?

**Recommendation Options:**
A. **Renumber CH07 → CH06** and update all references
B. **Keep CH07 numbering** but remove any CH06-specific continuity language
C. **Create a minimal CH06** that bridges the gap

---

### 3. ⚠️ **MODERATE: Length Targets Unchanged**

**Current:** All chapters target 1200–1500 words

**Math:**
- 6 chapters × 1200 words = 7,200 words minimum
- 6 chapters × 1500 words = 9,000 words maximum

**Your Goal:** "Trim bits by removing callback chapter"

**Issue:** Removing 1 chapter (1200-1500 words) only reduces total by ~13-16%. If you want significantly shorter readings, consider:
- Lowering per-chapter targets (e.g., 1000–1200)
- OR keeping 1200–1500 but accepting the new total (7,200-9,000 words)

**Recommendation:** Decide on total target length, then adjust per-chapter accordingly.

---

### 4. ⚠️ **MODERATE: Reaction Rotation System**

**Current instruction (all templates):**
```
Optional quick reaction allowed ("Oh my god," "Huh??," "Hm," "Whoa," "Sheesh," "Oh wow") 
on the same line, after a period. Rotate these reactions across chapters so no more than 
two chapters in a full 5-card reading repeat the same reaction.
```

**Problem:** The model has no way to track which reactions were used in previous chapters when generating sequentially. Each chapter is generated independently.

**Impact:** Reactions will likely repeat more than intended.

**Recommendation Options:**
A. **Remove rotation rule** - Let model choose naturally
B. **Specify per-chapter** - E.g., "CH01: prefer 'Whoa' or 'Oh wow'"
C. **Accept the limitation** - Keep rule as aspirational guidance

---

### 5. ⚠️ **MODERATE: Job Quota System**

**Current rule (all templates):**
```
"Job": max 1 mention in this chapter; across the full reading, use "job" in no more 
than 2 chapters. If quota earlier is ≥2, avoid "job" entirely...
```

**Problem:** Same as reactions - model can't track quota across sequential generation.

**Impact:** "Job" may appear in 3+ chapters.

**Recommendation:** Either:
A. **Accept limitation** - Keep as guidance
B. **Simplify** - "Max 1 mention per chapter; prefer rotating to other stakes"
C. **Post-process** - Check and edit after full generation

---

### 6. ⚠️ **MODERATE: Zodiac % Guidelines**

**Current distribution:**
- CH01: ~40% zodiac, 60% collective
- CH02-05: ~10% zodiac, 90% collective
- CH07: ~50% zodiac, 50% collective

**Questions:**
- What's the rationale for CH07 jumping to 50%?
- Is ~10% in CH02-05 intentionally minimal?

**Recommendation:** Clarify if this is intentional pacing strategy or should be adjusted.

---

### 7. ⚠️ **MINOR: Tiered Filter Repetition**

**Issue:** Lines 54-69 (tiered filter examples) are copy-pasted identically across ALL 6 templates.

**Impact:** Increases prompt token count unnecessarily.

**Recommendation:** Consider:
- Moving to a shared prompt header (if system supports it)
- OR keeping as-is for self-contained templates (current approach is safer)

---

### 8. ⚠️ **MINOR: "Safe Clichés" Contradiction**

**Lines 55-61 say these are OK:**
```
– "like you've been staring at the same options too long"
– "like the universe giving you a nudge"
– "ever feel like you've got all the tools but none are working"
```

**BUT lines 29, 91-93 say:**
```
• Any "it's like…" or "like…" comparison (similes).
[...]
- HEDGE CONTROL: Reduce filler "like" by 80%. If used, it must NOT create a simile:
  • Forbid: "like a…", "like the…", "like you/you're/they…"
```

**Contradiction:** The "safe" examples violate the "forbid" rules.

**Recommendation:** Clarify that these specific phrases are exempted, or rewrite them to avoid "like":
- "like you've been staring..." → "you've been staring..."
- "like the universe giving..." → "the universe is giving..."

---

### 9. ⚠️ **MINOR: CH01 Capitalization Duplication**

**Lines 82 and 141 both say:**
```
Line 82: - Keep it friendly/casual; ALWAYS capitalize the first letter of the first sentence.
Line 141: Always capitalize the first word of the first sentence.
```

**Impact:** Minimal, but redundant.

**Recommendation:** Remove one instance.

---

### 10. ⚠️ **MINOR: Empty [FINAL SELF-CHECK] Sections**

**Templates 02, 03, 04, 05:** Have `[FINAL SELF-CHECK — DO NOT PRINT]` with no content after.

**Template 01:** Has one line:
```
[FINAL SELF-CHECK — DO NOT PRINT]
```

**Template 07:** Has content:
```
[FINAL SELF-CHECK — DO NOT PRINT]
- Before sending, silently scan your draft: if >2 metaphors appear, delete or rewrite until only 2 remain...
```

**Recommendation:** Either:
A. Add self-check content to all templates (metaphor count, opener check, closer check)
B. Remove empty sections

---

## 🔧 RECOMMENDED FIXES

### **Priority 1 (Critical) - Do First:**

1. **Fix templates/07.txt**
   - Delete lines 136-237 (CH06 duplicate content)
   - Keep only CH07 finale instructions (lines 1-135)
   
2. **Decide on CH07 vs CH06 numbering**
   - Option A: Renumber 07.txt → 06.txt, update all "CH07" → "CH06"
   - Option B: Keep as CH07, update GOAL to clarify it's the finale after CH05

3. **Update generation logic**
   - Confirm `lib/generate.ts` generates: CH01 → CH02 → CH03 → CH04 → CH05 → CH07
   - OR: CH01 → CH02 → CH03 → CH04 → CH05 → CH06
   - Ensure template loading matches

### **Priority 2 (Moderate) - Consider:**

4. **Review length targets**
   - Decide if 1200–1500 per chapter is still desired
   - Calculate total: 6 × 1200 = 7,200 words minimum
   - Adjust if streamlining requires shorter chapters

5. **Simplify rotation rules**
   - Reaction rotation: Accept limitation or remove
   - Job quota: Simplify to "max 1 per chapter, prefer variety"

6. **Clarify zodiac % strategy**
   - Document why CH07 is 50% vs CH02-05 at 10%

### **Priority 3 (Polish) - Nice to Have:**

7. **Fix "safe clichés" contradiction**
   - Rewrite examples to avoid "like..." or add explicit exemption

8. **Add self-check content**
   - Add metaphor count check to all templates
   - Include opener/closer validation

9. **Remove duplication**
   - CH01 capitalization instruction (remove one)

---

## 🎬 NEXT STEPS

1. **You decide:** Should CH07 become CH06, or stay as CH07?
2. **I'll implement:** The template fixes based on your decision
3. **Test:** Generate a sample reading to verify flow
4. **Iterate:** Adjust length/tone as needed

---

## 📊 CURRENT STATE SUMMARY

**Structure:** 6 chapters (CH01-CH05, CH07)  
**Templates:** 6 files (01.txt, 02.txt, 03.txt, 04.txt, 05.txt, 07.txt)  
**Critical Issues:** 3 (CH07 duplication, missing CH06 bridge, numbering confusion)  
**Moderate Issues:** 4 (length targets, rotation tracking, zodiac %, job quota)  
**Minor Issues:** 3 (tiered filter repetition, safe clichés contradiction, empty sections)  

**Overall Assessment:** System instructions are 85% solid, but need critical fixes to CH07 and clarification on chapter structure before production use.

