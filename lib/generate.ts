import OpenAI from 'openai';
import { TPL_01, TPL_02, TPL_03, TPL_04, TPL_05, TPL_06 } from './templates';
import { saveTextBlob, deleteOldFiles } from './storage';
import { applyBreaks } from './withBreaks';
import { headerize, timestampedName } from './postprocess';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function genChapter(prompt: string, model = 'gpt-4o'): Promise<string> {
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
    // 1) Generate chapters (sequential to respect "locked spread" semantics)
    console.log('[generate] Generating CH01...');
    const ch1 = await genChapter(TPL_01.replaceAll('{sign}', sign));
    
    console.log('[generate] Generating CH02...');
    const ch2 = await genChapter(TPL_02.replaceAll('{sign}', sign));
    
    console.log('[generate] Generating CH03...');
    const ch3 = await genChapter(TPL_03.replaceAll('{sign}', sign));
    
    console.log('[generate] Generating CH04...');
    const ch4 = await genChapter(TPL_04.replaceAll('{sign}', sign));
    
    console.log('[generate] Generating CH05...');
    const ch5 = await genChapter(TPL_05.replaceAll('{sign}', sign));
    
    console.log('[generate] Generating CH07...');
    const ch7 = await genChapter(TPL_06.replaceAll('{sign}', sign));

    // 2) Stitch
    console.log('[generate] Stitching chapters...');
    const stitchedRaw = [ch1, ch2, ch3, ch4, ch5, ch7].join('\n\n');

    // 3) Headerize (downstream)
    console.log('[generate] Adding header...');
    const stitchedWithHeader = headerize(stitchedRaw, sign);

    // 4) Save stitched
    console.log('[generate] Saving stitched file...');
    const plainName = timestampedName('FULL_READING', sign);
    await saveTextBlob(plainName, stitchedWithHeader);

    // 5) Apply breaks (downstream)
    console.log('[generate] Applying break tags...');
    const withBreaks = applyBreaks(stitchedWithHeader);
    const breaksName = timestampedName('FULL_READING_with_breaks', sign);
    await saveTextBlob(breaksName, withBreaks);

    // 6) Clean up old files (keep only 5 most recent)
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
