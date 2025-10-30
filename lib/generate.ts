import OpenAI from 'openai';
import { TPL_01, TPL_02, TPL_03, TPL_04, TPL_05, TPL_06 } from './templates';
import { saveTextBlob, deleteOldFiles } from './storage';
import { applyBreaks } from './withBreaks';
import { headerize, timestampedName } from './postprocess';
import { getConfig } from './config';
import { sanitizeForOutput } from './sanitize';
import { drawSpread, drawClarifiers } from './spread';
import { redactUnrevealedCards } from './validator';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function genChapter(prompt: string, model = 'gpt-4.1-mini'): Promise<string> {
  const r = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are ANGELA for White Soul Tarot 2.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
  });
  return r.choices[0]?.message?.content || '';
}

export async function generateFullReading(sign: string) {
  console.log(`[generate] Starting full reading generation for ${sign}`);
  
  try {
    // Get config with date anchor
    const cfg = getConfig();
    cfg.sign = sign; // Override with provided sign
    
    // 0) Draw unique 5-card spread (cards can only appear once, regardless of orientation)
    const spread = drawSpread(cfg.reversal_ratio);
    const [c1, c2, c3, c4, c5] = spread;
    
    // Draw clarifiers (max 2, also unique)
    const usedCards = new Set(spread.map(card => card.replace(/, reversed$/i, '').trim()));
    const clarifierCards = drawClarifiers(usedCards, 2);
    const clarifiers = clarifierCards.length > 0 ? clarifierCards.join(' | ') : 'none';
    
    console.log(`[spread] Locked spread: ${spread.join(' | ')}`);
    console.log(`[spread] Clarifiers: ${clarifiers}`);
    
    // 1) Generate chapters (sequential to respect "locked spread" semantics)
    // CRITICAL: Implement linear narrative - each chapter only knows cards revealed so far
    console.log('[generate] Generating CH01...');
    const ch1Prompt = TPL_01
      .replaceAll('{sign}', sign)
      .replaceAll('{date_anchor}', cfg.date_anchor)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', '???') // Future cards hidden
      .replaceAll('{c3}', '???') // Future cards hidden
      .replaceAll('{c4}', '???') // Future cards hidden
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH01 gets clarifiers (revealed with Card 1)
      .replaceAll('{card1_line}', c1);
    let ch1 = await genChapter(ch1Prompt, cfg.openai_model);
    // Enforce linear narrative: only Card 01 allowed before any other reveals
    ({ text: ch1 } = redactUnrevealedCards(
      ch1,
      [c1, c2, c3, c4, c5],
      [c1],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH02...');
    const ch2Prompt = TPL_02
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', '???') // Future cards hidden
      .replaceAll('{c4}', '???') // Future cards hidden
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH02 gets clarifiers (already revealed)
      .replaceAll('{card2_line}', c2);
    let ch2 = await genChapter(ch2Prompt, cfg.openai_model);
    ({ text: ch2 } = redactUnrevealedCards(
      ch2,
      [c1, c2, c3, c4, c5],
      [c1, c2],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH03...');
    const ch3Prompt = TPL_03
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', '???') // Future cards hidden
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH03 gets clarifiers (already revealed)
      .replaceAll('{card3_line}', c3);
    let ch3 = await genChapter(ch3Prompt, cfg.openai_model);
    ({ text: ch3 } = redactUnrevealedCards(
      ch3,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH04...');
    const ch4Prompt = TPL_04
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', c4)
      .replaceAll('{c5}', '???') // Future cards hidden
      .replaceAll('{clarifiers}', clarifiers) // CH04 gets clarifiers (already revealed)
      .replaceAll('{card4_line}', c4);
    let ch4 = await genChapter(ch4Prompt, cfg.openai_model);
    ({ text: ch4 } = redactUnrevealedCards(
      ch4,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3, c4],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH05...');
    const ch5Prompt = TPL_05
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', c4)
      .replaceAll('{c5}', c5)
      .replaceAll('{clarifiers}', clarifiers) // CH05 gets clarifiers (already revealed)
      .replaceAll('{card5_line}', c5);
    let ch5 = await genChapter(ch5Prompt, cfg.openai_model);
    ({ text: ch5 } = redactUnrevealedCards(
      ch5,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3, c4, c5],
      clarifierCards
    ));
    
    console.log('[generate] Generating CH06 (finale)...');
    const ch6Prompt = TPL_06
      .replaceAll('{sign}', sign)
      .replaceAll('{c1}', c1)
      .replaceAll('{c2}', c2)
      .replaceAll('{c3}', c3)
      .replaceAll('{c4}', c4)
      .replaceAll('{c5}', c5)
      .replaceAll('{clarifiers}', clarifiers); // CH06 gets clarifiers (all revealed)
    let ch6 = await genChapter(ch6Prompt, cfg.openai_model);
    ({ text: ch6 } = redactUnrevealedCards(
      ch6,
      [c1, c2, c3, c4, c5],
      [c1, c2, c3, c4, c5],
      clarifierCards
    ));

    // 2) Stitch
    console.log('[generate] Stitching chapters...');
    const stitchedRaw = [ch1, ch2, ch3, ch4, ch5, ch6].join('\n\n');

    // 3) Sanitize (remove debug logs)
    console.log('[generate] Sanitizing content...');
    const stitchedSanitized = sanitizeForOutput(stitchedRaw, { breaks: 'none' });

    // 4) Headerize (downstream)
    console.log('[generate] Adding header...');
    const stitchedWithHeader = headerize(stitchedSanitized, sign);

    // 5) Save stitched
    console.log('[generate] Saving stitched file...');
    const plainName = timestampedName('FULL_READING', sign);
    await saveTextBlob(plainName, stitchedWithHeader);

    // 6) Apply breaks (downstream)
    console.log('[generate] Applying break tags...');
    const withBreaks = applyBreaks(stitchedWithHeader);
    const breaksName = timestampedName('FULL_READING_with_breaks', sign);
    await saveTextBlob(breaksName, withBreaks);

    // 7) Clean up old files (keep only 5 most recent)
    console.log('[generate] Cleaning up old files...');
    await deleteOldFiles(`FULL_READING__${sign}__`, 5);
    await deleteOldFiles(`FULL_READING_with_breaks__${sign}__`, 5);

    console.log(`[generate] Generation complete: ${plainName}, ${breaksName}`);
    return { plainName, breaksName };
    
  } catch (error) {
    console.error('[generate] Error during generation:', error);
    throw error;
  }
}
