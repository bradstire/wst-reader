// pages/api/file.ts
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTDIR = path.join(ROOT, "output");

// Whitelist of allowed file names
const ALLOWED_FILES = [
  'CH01_generated.txt',
  'CH02_generated.txt', 
  'CH03_generated.txt',
  'CH04_generated.txt',
  'CH05_generated.txt',
  'CH06_generated.txt',
  'CH07_generated.txt',
  'FULL_READING.txt',
  'FULL_READING_WITH_BREAKS.txt', // legacy alias
  'FULL_READING_with_breaks.txt',  // actual filename written by generator
  'WHITE_SOUL_TAROT_with_breaks.txt' // break-applied file from apply_breaks.py
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name } = req.query;
  const signParam = (req.query.sign as string) || '';

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: "Missing file name" });
  }

  // Check if break-applied file exists first
  if (name === 'WHITE_SOUL_TAROT_with_breaks.txt') {
    const breakAppliedFile = path.join(OUTDIR, 'WHITE_SOUL_TAROT_with_breaks.txt');
    if (fs.existsSync(breakAppliedFile)) {
      // Serve the break-applied file directly
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="WHITE_SOUL_TAROT_with_breaks.txt"');
      const stream = fs.createReadStream(breakAppliedFile);
      stream.pipe(res);
      return;
    } else {
      // Fallback: build from chapter files with [BREAK] markers
      try {
        const ids = ['CH01','CH02','CH03','CH04','CH05','CH06','CH07'];
        const parts: string[] = [];
        for (const id of ids) {
          const p = path.join(OUTDIR, `${id}_generated.txt`);
          if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf8'));
        }
        if (parts.length === 0) return res.status(404).json({ error: 'No chapter files found' });
        const assembled = parts.join('\n\n[BREAK]\n\n');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="WHITE_SOUL_TAROT_with_breaks.txt"');
        res.write(assembled, 'utf8');
        return res.end();
      } catch (e) {
        return res.status(500).json({ error: 'Failed to build with-breaks file' });
      }
    }
  }

  // If requester asks for latest timestamped per-sign files
  if (name === 'latest_with_breaks') {
    try {
      const files = fs.readdirSync(OUTDIR).filter(f => f.startsWith('FULL_READING_with_breaks__'));
      const filtered = signParam ? files.filter(f => f.includes(`__${signParam}__`)) : files;
      if (filtered.length === 0) return res.status(404).json({ error: 'No with-breaks files found' });
      const latest = filtered.sort().reverse()[0];
      const full = path.join(OUTDIR, latest);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${latest}"`);
      return fs.createReadStream(full).pipe(res);
    } catch {
      return res.status(500).json({ error: 'Failed to list with-breaks files' });
    }
  }

  if (name === 'latest_stitched') {
    try {
      const files = fs.readdirSync(OUTDIR).filter(f => f.startsWith('FULL_READING__'));
      const filtered = signParam ? files.filter(f => f.includes(`__${signParam}__`)) : files;
      if (filtered.length === 0) {
        // fallback to plain stitched
        const plain = path.join(OUTDIR, 'FULL_READING.txt');
        if (!fs.existsSync(plain)) return res.status(404).json({ error: 'No stitched file found' });
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="FULL_READING.txt"');
        return fs.createReadStream(plain).pipe(res);
      }
      const latest = filtered.sort().reverse()[0];
      const full = path.join(OUTDIR, latest);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${latest}"`);
      return fs.createReadStream(full).pipe(res);
    } catch {
      return res.status(500).json({ error: 'Failed to list stitched files' });
    }
  }

  // Map legacy uppercase request to actual lowercase filename
  const resolvedName = name === 'FULL_READING_WITH_BREAKS.txt' ? 'FULL_READING_with_breaks.txt' : name;

  if (!ALLOWED_FILES.includes(resolvedName)) {
    return res.status(400).json({ error: "File not allowed" });
  }

  let filePath = path.join(OUTDIR, resolvedName);

  if (!fs.existsSync(filePath)) {
    // Fallback: if with_breaks is missing, serve the plain file so the button works
    if (resolvedName === 'FULL_READING_with_breaks.txt') {
      const plainPath = path.join(OUTDIR, 'FULL_READING.txt');
      if (fs.existsSync(plainPath)) {
        filePath = plainPath;
      } else {
        return res.status(404).json({ error: "File not found" });
      }
    } else {
      return res.status(404).json({ error: "File not found" });
    }
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${resolvedName}"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}