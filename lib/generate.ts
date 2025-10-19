import OpenAI from 'openai';
import { TPL_01, TPL_02, TPL_03, TPL_04, TPL_05, TPL_06 } from './templates';
import { saveTextBlob, deleteOldFiles } from './storage';
import { applyBreaks } from './withBreaks';
import { headerize, timestampedName } from './postprocess';
import { getConfig } from './config';
import { sanitizeForOutput } from './sanitize';

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
    
    // 1) Generate chapters (sequential to respect "locked spread" semantics)
    console.log('[generate] Generating CH01...');
    const ch1Prompt = TPL_01
      .replaceAll('{sign}', sign)
      .replaceAll('{date_anchor}', cfg.date_anchor);
    const ch1 = await genChapter(ch1Prompt, cfg.openai_model);
    
    console.log('[generate] Generating CH02...');
    const ch2Prompt = TPL_02.replaceAll('{sign}', sign);
    const ch2 = await genChapter(ch2Prompt, cfg.openai_model);
    
    console.log('[generate] Generating CH03...');
    const ch3Prompt = TPL_03.replaceAll('{sign}', sign);
    const ch3 = await genChapter(ch3Prompt, cfg.openai_model);
    
    console.log('[generate] Generating CH04...');
    const ch4Prompt = TPL_04.replaceAll('{sign}', sign);
    const ch4 = await genChapter(ch4Prompt, cfg.openai_model);
    
    console.log('[generate] Generating CH05...');
    const ch5Prompt = TPL_05.replaceAll('{sign}', sign);
    const ch5 = await genChapter(ch5Prompt, cfg.openai_model);
    
    console.log('[generate] Generating CH06 (finale)...');
    const ch6Prompt = TPL_06.replaceAll('{sign}', sign);
    const ch6 = await genChapter(ch6Prompt, cfg.openai_model);

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
