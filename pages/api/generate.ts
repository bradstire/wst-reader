import type { NextApiRequest, NextApiResponse } from 'next';
import { generateFullReading } from '../../lib/generate';

export const config = { 
  api: { 
    bodyParser: true, 
    responseLimit: false 
  } 
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sign = (req.query.sign as string) || (req.body?.sign as string) || 'Gemini';
    console.log(`[generate] Starting generation for sign: ${sign}`);
    
    const out = await generateFullReading(sign);
    
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.status(200).json({ 
      success: true, 
      ...out, 
      sign 
    });
  } catch (e: any) {
    console.error('[generate] Error:', e);
    res.status(500).json({ 
      success: false, 
      error: String(e?.message || e) 
    });
  }
}