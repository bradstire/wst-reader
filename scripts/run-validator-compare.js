const fs = require('fs');
const path = require('path');

function countOccurrences(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

(async () => {
  try {
    const inputPath = path.resolve(__dirname, '../output/FULL_READING__Verify_v5.2.6_LOCK__2025-11-01T06-57-23Z.txt');
    const inputText = fs.readFileSync(inputPath, 'utf8');

    const initialEnergy = countOccurrences(inputText, /\benergy\b/gi);
    const initialSignature = countOccurrences(
      inputText,
      /\b(You knew[^.!?\n]{0,50}(?:before you said it|this already|that already)|Don't lie to yourself)/gi
    );

    console.log('[compare] Input loaded from', inputPath);
    console.log(`[compare] Initial energy count: ${initialEnergy}`);
    console.log(`[compare] Initial signature count: ${initialSignature}`);

    const spreadCards = [];
    const revealedCards = [];
    const clarifierCards = [];

    const baselineModule = require('../tmp/validator-compare/validator');
    const guardrailModule = require('../tmp/validator-compare/validator_guardrail');

    const baselineResult = baselineModule.redactUnrevealedCards(
      inputText,
      spreadCards,
      revealedCards,
      clarifierCards
    );

    const baselineOutputPath = path.resolve(__dirname, '../output/CONTROL_RETEST_BASELINE.txt');
    fs.writeFileSync(baselineOutputPath, baselineResult.text, 'utf8');

    const baselineEnergy = countOccurrences(baselineResult.text, /\benergy\b/gi);
    const baselineSignature = countOccurrences(
      baselineResult.text,
      /\b(You knew[^.!?\n]{0,50}(?:before you said it|this already|that already)|Don't lie to yourself)/gi
    );

    console.log('\n[baseline] Output written to', baselineOutputPath);
    console.log(`[baseline] Final energy count: ${baselineEnergy}`);
    console.log(`[baseline] Final signature count: ${baselineSignature}`);

    const guardrailResult = guardrailModule.redactUnrevealedCards(
      inputText,
      spreadCards,
      revealedCards,
      clarifierCards
    );

    const guardrailOutputPath = path.resolve(__dirname, '../output/LOCK_CHECK_GUARDRAIL.txt');
    fs.writeFileSync(guardrailOutputPath, guardrailResult.text, 'utf8');

    const guardrailEnergy = countOccurrences(guardrailResult.text, /\benergy\b/gi);
    const guardrailSignature = countOccurrences(
      guardrailResult.text,
      /\b(You knew[^.!?\n]{0,50}(?:before you said it|this already|that already)|Don't lie to yourself)/gi
    );

    console.log('\n[guardrail] Output written to', guardrailOutputPath);
    console.log(`[guardrail] Final energy count: ${guardrailEnergy}`);
    console.log(`[guardrail] Final signature count: ${guardrailSignature}`);

    const fragmentFixes = guardrailEnergy <= 10 && guardrailSignature <= 3;
    console.log(`LOCK-READY: energy<=10=${guardrailEnergy <= 10}, signature<=3=${guardrailSignature <= 3}, fragments fixed=${fragmentFixes}`);

    console.log('\n[compare] Completed baseline vs guardrail comparison.');
  } catch (err) {
    console.error('[compare] Error during comparison:', err);
    process.exit(1);
  }
})();
