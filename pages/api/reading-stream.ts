import type { NextApiRequest, NextApiResponse } from 'next';
import { latestByPrefix } from '../../lib/storage';

export const config = { 
  api: { 
    responseLimit: '16mb' 
  } 
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sign = (req.query.sign as string) || 'Gemini';
    console.log(`[reading-stream] Fetching latest reading for sign: ${sign}`);
    
    const latest = await latestByPrefix(`FULL_READING__${sign}__`);
    if (!latest) {
      return res.status(404).json({ error: 'No reading found for this sign' });
    }

    console.log(`[reading-stream] Found latest file: ${latest.pathname}`);
    
    const resp = await fetch(latest.url);
    
    if (!resp.ok) {
      throw new Error(`Blob fetch failed: ${resp.status}`);
    }

    const text = await resp.text();
    
    // Set SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send the text as a single SSE event
    res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
    res.end();

  } catch (error) {
    console.error('[reading-stream] Error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}