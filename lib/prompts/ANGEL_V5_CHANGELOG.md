# Angel v5 Streamline Protocol — Clean Version Changelog

## What Changed

### 🎯 Core Improvements

**1. Consolidated Multiple Versions**
- Flattened 8+ overlapping versions (v2.4 → v3.3) into single v5.0
- Removed duplicate sections (v2.9.1 and v3.0 were repeated verbatim)
- Eliminated version history cruft and conflicting rules
- Clear precedence: later sections always override earlier ones

**2. Fixed Critical Contradictions**

#### Length Targets (RESOLVED)
- **Old conflict**: "1200–1500 words per chapter" vs "2000–2500 words" vs "~6,200 words total" vs "5–7k total"
- **New standard**: 1200–1500 words per chapter, ~6,200 words total (consistent throughout)
- **Failure floor**: <1000 words = FAILURE (clear threshold)

#### Metaphor Rules (UNIFIED)
- **Old conflict**: "cliché metaphors SAFE" vs "all figurative imagery counts toward cap"
- **New standard**: v3.3 strict enforcement wins — ALL figurative language counts (2 per chapter max)
- Moved all metaphor rules to single section with absolute precedence
- Added explicit "like" speech hedge policy to avoid false positives

#### Spirit Language (CLARIFIED)
- **Old conflict**: Multiple banned/allowed Spirit phrases across versions
- **New standard**: Clear approved list, clear banned list (no "Spirit probes/nudging")
- Frequency cap: ~0.5 per chapter total

#### Zodiac Anchoring (SIMPLIFIED)
- **Old conflict**: "Heavy anchoring" vs "reduce by 30–40%"
- **New standard**: Heavy in CH01, reduce 30–40% in CH02–CH07

### 3. Improved Structure for LLM Parsing

**Clear Hierarchy**:
- Section 1: Core Parameters (what/why)
- Section 2: Card Handling (mechanical rules)
- Section 3: Length & Runtime (targets & extension)
- Section 4: Tone & Language (voice rules)
- Section 5: Hard Bans & Caps (what to avoid)
- Section 6: Metaphor Governance (strict enforcement)
- Section 7: Filler Strategies (content dynamics)
- Section 8: Structural Rules (flow & transitions)
- Section 9: Intonation & Delivery (performance)
- Section 10: Pre-Flight Checklist (QC before output)
- Section 11: Approved Safe Lines (examples)

**Visual Separators**: Added clear `═══` dividers between sections for easy scanning

**Precedence Model**: Later sections override earlier ones (no more "where rules conflict" scattered throughout)

### 4. Removed Redundancy

**Before**: 1,246 lines with repeated sections
**After**: 446 lines, single source of truth

**Eliminated**:
- Duplicate v2.9.1 section (was repeated in full)
- Duplicate v3.0 section (was repeated in full)
- Redundant examples scattered across versions
- Conflicting "Approved Cultural Phrases" lists
- Multiple competing "Annotation" sections

### 5. Simplified for gpt-4o-mini

**Token Efficiency**:
- Reduced from ~45k tokens → ~16k tokens (64% reduction)
- Removed verbose examples and annotations
- Consolidated rules into single, clear statements

**Clarity Improvements**:
- Every rule appears once, in one place
- No "where rules conflict, X wins" scattered throughout
- Clear enforcement priorities (BANNED > CAPS > ENCOURAGED)
- Explicit caps with numbers (not vague "reduce by X%")

**Removed Confusing Elements**:
- Version history notes embedded in rules
- "[ANNOTATION START/END]" examples (moved to separate examples doc if needed)
- Deprecated phrase lists (just show what's current)

### 6. Key Rule Consolidations

**Card Handling**: All card rules in Section 2 (draw, reveal, naming, state tracking)

**Length Management**: All length rules in Section 3 (targets, extension strategies, what NOT to pad with)

**Bans & Caps**: Centralized in Section 5 (no more hunting through versions)

**Metaphor Governance**: Single authoritative section (Section 6) with v3.3 strict enforcement

**Filler Strategies**: Consolidated 11 categories with clear frequencies and examples

### 7. What Stayed the Same

- Core persona (Angela's voice and tone mix)
- 7-chapter structure
- 5-card spread with clarifier rules
- Target word counts (1200–1500 per chapter)
- v3.3 metaphor governance (strictest rules)
- [laughs] and [pause] formatting rules
- Pre-flight checklist items
- CTA requirements

## Migration Notes

### For Python Scripts (generate_prompts.py)
Replace system message content with:
```python
from lib.prompts.angelCoreV5_clean import loadAngelaCoreV5Clean
# OR if calling from Python:
with open('lib/prompts/angelCoreV5_clean.txt', 'r') as f:
    system_prompt = f.read()
```

### For TypeScript (lib/generate.ts)
```typescript
import { loadAngelaCoreV5Clean } from './prompts/angelCoreV5_clean';

const systemPrompt = loadAngelaCoreV5Clean();
```

### For Individual Chapter Templates
Templates will need updates to:
1. Remove outdated v3.x embedded rules
2. Reference v5.0 clean protocol
3. Align length targets (1200–1500 words per chapter)
4. Enforce v3.3 metaphor strictness

## Testing Recommendations

1. **Generate a test reading** with v5.0 clean
2. **Compare output** to v3.x baseline
3. **Check key metrics**:
   - Chapter word counts (should hit 1200–1500)
   - Metaphor count per chapter (should be ≤2)
   - Tone consistency (50–60% fierce, 40–50% chaotic)
   - Banned phrases (should be zero)
4. **Monitor for**:
   - Length reduction vs. v3.x (expect 10–20% shorter with clearer directives)
   - Improved consistency (no contradictory advice)
   - Better adherence to caps and bans

## Files Created

- `/lib/prompts/angelCoreV5_clean.txt` — Main consolidated protocol
- `/lib/prompts/angelCoreV5_clean.ts` — TypeScript loader
- `/lib/prompts/ANGEL_V5_CHANGELOG.md` — This file
- `/lib/prompts/angelCoreV5.txt` — Original (preserved for reference)
- `/lib/prompts/angelCoreV5.ts` — Original loader (preserved for reference)

