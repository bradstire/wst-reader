import type { NextApiRequest, NextApiResponse } from 'next';
import { latestByPrefix } from '../../lib/storage';
import { sanitizeForOutput } from '../../lib/sanitize';

export const config = { 
  api: { 
    responseLimit: false  // Remove size limit
  } 
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sign = (req.query.sign as string) || 'Gemini';
            console.log(`[reading-stream] PUBLIC ACCESS TEST - Fetching latest reading for sign: ${sign}`);
    
    const latest = await latestByPrefix(`FULL_READING__${sign}__`);
    if (!latest) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ delta: "🎉 NEW CODE IS RUNNING! No reading found for this sign. Try generating a new reading first." })}\n\n`);
      res.end();
      return;
    }

    console.log(`[reading-stream] Found latest file: ${latest.pathname}`);
    
    let text: string;
    
    if (latest.url.startsWith('file://')) {
      // Local file fallback
      const fs = require('fs');
      const filePath = latest.url.replace('file://', '');
      text = fs.readFileSync(filePath, 'utf8');
    } else {
      // Blob storage
      const resp = await fetch(latest.url);
      if (!resp.ok) {
        throw new Error(`Blob fetch failed: ${resp.status}`);
      }
      text = await resp.text();
    }
    
    // Remove headers from content (headers should only be in filename)
    const headerMatch = text.match(/^\[ZODIAC: .*\]\n\[GENERATED_AT: .*\]\n\n/);
    if (headerMatch) {
      text = text.substring(headerMatch[0].length);
    }
    
    // Sanitize the content to remove debug metadata
    text = sanitizeForOutput(text, { breaks: 'none' });
    
    // Set SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Stream the text paragraph by paragraph
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    
    let paragraphIndex = 0;
    const streamInterval = setInterval(() => {
      if (paragraphIndex < paragraphs.length) {
        const paragraph = paragraphs[paragraphIndex].trim();
        if (paragraph) {
          res.write(`data: ${JSON.stringify({ delta: paragraph })}\n\n`);
          paragraphIndex++;
        } else {
          paragraphIndex++;
        }
      } else {
        clearInterval(streamInterval);
        res.end();
      }
    }, 1500); // 1.5 second delay between paragraphs

  } catch (error) {
    console.error('[reading-stream] Error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}