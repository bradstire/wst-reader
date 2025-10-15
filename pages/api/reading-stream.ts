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

  // Simple test response to verify deployment
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  res.write(`data: ${JSON.stringify({ delta: "🎉 SIMPLE DEPLOYMENT TEST - New code is running on Vercel!" })}\n\n`);
  res.end();
}