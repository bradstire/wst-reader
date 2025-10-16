// pages/api/reading-stream.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { spawn } from "child_process";
import { sanitizeForOutput } from "../../lib/sanitize";

export const config = { api: { bodyParser: false } };

const ROOT = process.cwd();
const OUTDIR = path.join(ROOT, "output");
const IDS = ['CH01','CH02','CH03','CH04','CH05','CH06','CH07'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[reading-stream] fresh=%s sign=%s', req.query.fresh, req.query.sign);
  
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as any).flushHeaders?.();

  const breaks = (req.query.breaks as any) || 'none';
  const fresh = req.query.fresh === '1';
  const sign = (req.query.sign as string) || 'Gemini';
  const keepalive = setInterval(() => res.write(':ka\n\n'), 15000);

  try {
    if (fresh) {
      // Remove old chapter files
      for (const id of IDS) {
        const file = path.join(OUTDIR, `${id}_generated.txt`);
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        } catch (err) {
          // Ignore errors if file missing
        }
      }

      // Spawn Python generation
      const child = spawn('python3', ['generate_prompts.py', '--sign', sign], {
        cwd: process.cwd(),
        env: process.env,
      });

      // Track progress from Python output
      let progress = 0;
      const totalChapters = 7;
      let warningCount = 0;
      
      // Emit an initial progress event as soon as child produces any stdout
      let hasEmittedInitialProgress = false;
      child.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[python-stdout]', output);

        if (!hasEmittedInitialProgress) {
          hasEmittedInitialProgress = true;
          // Kick progress to 5% right away so the bar moves immediately
          progress = Math.max(progress, 5);
          res.write(`data: [progress] ${progress}\n\n`);
        }
        
        // Track progress based on Python output - fix regex to match actual output
        if (output.includes('[info] Generating CH')) {
          const match = output.match(/\[info\] Generating CH(\d+)/);
          if (match) {
            const chapterNum = parseInt(match[1]);
            progress = Math.round((chapterNum / totalChapters) * 100);
            console.log(`[progress] Chapter ${chapterNum}/7 = ${progress}%`);
            res.write(`data: [progress] ${progress}\n\n`);
          }
        }
        
        // Also track when chapters are completed
        if (output.includes('[ok] Wrote CH') && output.includes('_generated.txt')) {
          const match = output.match(/\[ok\] Wrote CH(\d+)_generated\.txt/);
          if (match) {
            const chapterNum = parseInt(match[1]);
            progress = Math.round((chapterNum / totalChapters) * 100);
            console.log(`[progress] Completed Chapter ${chapterNum}/7 = ${progress}%`);
            res.write(`data: [progress] ${progress}\n\n`);
          }
        }
        
        // Track prompt writing for earlier progress
        if (output.includes('[ok] Wrote CH') && output.includes('_prompt.txt')) {
          const match = output.match(/\[ok\] Wrote CH(\d+)_prompt\.txt/);
          if (match) {
            const chapterNum = parseInt(match[1]);
            // Give some progress for prompt writing (earlier stage)
            const promptsCompleted = chapterNum; // at least this many prompts are written
            const promptsPortion = Math.min(30, Math.round((promptsCompleted / totalChapters) * 30)); // up to 30%
            progress = Math.max(progress, promptsPortion);
            console.log(`[progress] Prompt CH${chapterNum}/7 = ${progress}%`);
            res.write(`data: [progress] ${progress}\n\n`);
          }
        }
        
        // Send completion message when all chapters are done
        if (output.includes('[ok] Stitched 7 files')) {
          res.write(`data: [progress] 100\n\n`);
        }
        
        // Forward warning messages to frontend
        if (output.includes('[warn]')) {
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes('[warn]')) {
              warningCount++;
              res.write(`data: ${line}\n\n`);
            }
          }
        }
      });

      // Suppress stderr to avoid showing tracebacks to user
      child.stderr.on('data', (data) => {
        console.error('[python-stderr]', data.toString());
      });

      // Wait for Python to complete
      await new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) {
            resolve(void 0);
          } else {
            reject(new Error(`Generation failed with code ${code}`));
          }
        });
      });

      // Check if all chapters failed (7 warnings = all chapters failed)
      if (warningCount >= 7) {
        res.write(`data: [error] All chapters failed due to API quota exceeded. Please check your OpenAI billing.\n\n`);
        clearInterval(keepalive);
        res.end();
        return;
      }

      // Downstream post-processing: create timestamped copies by filename only (no header in file)
      try {
        console.log('[reading-stream] Creating timestamped stitched copy...');
        const headerChild = spawn('python3', ['postprocess_files.py', 'copy_stitched', sign], {
          cwd: process.cwd(),
          env: process.env,
        });
        await new Promise((resolve) => {
          headerChild.on('close', (_code) => resolve(void 0));
          headerChild.on('error', () => resolve(void 0));
        });

        console.log('[reading-stream] Applying break tags to generated content (timestamped filename)...');
        const breakChild = spawn('python3', ['apply_breaks.py', '--sign', sign], {
          cwd: process.cwd(),
          env: process.env,
        });

        await new Promise((resolve) => {
          breakChild.on('close', (_code) => resolve(void 0));
          breakChild.on('error', () => resolve(void 0));
        });
      } catch (err) {
        console.error('[reading-stream] Post-processing failed:', err);
        // Continue even if downstream post-processing fails
      }

      // Send meta line for fresh run
      const metaFile = path.join(OUTDIR, 'CH07_generated.txt');
      if (fs.existsSync(metaFile)) {
        const stats = fs.statSync(metaFile);
        res.write(`data: [meta] source=files mode=fresh generated_at=${stats.mtime.toISOString()}\n\n`);
      }
    } else {
      // Check if files are old (15 minutes)
      const checkFile = path.join(OUTDIR, 'CH07_generated.txt');
      if (fs.existsSync(checkFile)) {
        const stats = fs.statSync(checkFile);
        const ageMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
        if (ageMinutes > 15) {
          res.write(`data: [warn] Using cached files older than 15m. Pass fresh=1 to regenerate.\n\n`);
        }
        res.write(`data: [meta] source=files mode=cache generated_at=${stats.mtime.toISOString()}\n\n`);
      }
    }

    // Stream the chapter files
    for (const id of IDS) {
      const file = path.join(OUTDIR, `${id}_generated.txt`);
      if (!fs.existsSync(file)) continue;

      const rs = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 4096 });
      for await (const raw of Readable.from(rs)) {
        const clean = sanitizeForOutput(String(raw), { breaks });
        if (clean) res.write(`data: ${JSON.stringify({ delta: clean })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ delta: '\n\n' })}\n\n`);
    }
  } catch (error) {
    res.write(`data: [error] generation failed\n\n`);
  } finally {
    clearInterval(keepalive);
    res.end();
  }
}