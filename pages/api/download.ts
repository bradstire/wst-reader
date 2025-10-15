import type { NextApiRequest, NextApiResponse } from 'next';
import { latestByPrefix } from '../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sign = (req.query.sign as string) || 'Gemini';
    const kind = (req.query.kind as string) || 'plain'; // 'plain' | 'breaks'
    
    console.log(`[download] Fetching ${kind} file for sign: ${sign}`);
    
    const prefix = kind === 'breaks' 
      ? `FULL_READING_with_breaks__${sign}__` 
      : `FULL_READING__${sign}__`;

    const latest = await latestByPrefix(prefix);
    if (!latest) {
      return res.status(404).json({ error: `No ${kind} file found for this sign` });
    }

    console.log(`[download] Found file: ${latest.pathname}`);
    
    const r = await fetch(latest.url);
    
    if (!r.ok) {
      throw new Error(`Blob fetch failed: ${r.status}`);
    }
    
    const text = await r.text();
    const filename = latest.pathname.split('/').pop() || `reading_${kind}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(text);

  } catch (error) {
    console.error('[download] Error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
