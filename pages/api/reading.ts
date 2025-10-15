// pages/api/reading.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { sanitizeForOutput } from "../../lib/sanitize";

const OUTPUT_FILE = path.join(process.cwd(), "output", "FULL_READING.txt");
const FRESH_MS = 5 * 60 * 1000; // 5 minutes

async function isFresh(filePath: string, maxAgeMs: number) {
  try {
    const st = await fs.stat(filePath);
    return st.size > 0 && Date.now() - st.mtimeMs < maxAgeMs;
  } catch {
    return false;
  }
}

function runGenerator(breaksMode?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd();
    const PY = process.env.WST_PYTHON || "python3";
    const env = { ...process.env };
    if (breaksMode) env.WST_BREAKS_MODE = breaksMode;

    const proc = spawn(PY, ["-u", "generate_prompts.py"], { cwd, env });

    let out = "";
    let err = "";

    // 2-minute safety timeout
    const timeout = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
    }, 120_000);

    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));

    // Use 'exit' instead of 'close' to avoid dev server quirks
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`Generator exited ${code}: ${err || out}`));
      }
      resolve(out.trim());
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { breaks } = (req.body ?? {}) as { breaks?: string };

    // Only regenerate if the stitched file is missing or stale
    const fresh = await isFresh(OUTPUT_FILE, FRESH_MS);
    if (!fresh) {
      await runGenerator(breaks);
      if (!fssync.existsSync(OUTPUT_FILE)) {
        return res.status(500).json({ error: "FULL_READING.txt not found after generation." });
      }
    }

    // Read + normalize + return as plain text (UI reads resp.text())
    const text = await fs.readFile(OUTPUT_FILE, "utf-8");

    // normalize paragraph breaks so single \n becomes blank-line paragraphs
    const normalized = text
      .replace(/\r\n/g, "\n")              // CRLF → LF
      .replace(/([^\n])\n(?!\n)/g, "$1\n\n"); // expand single \n into paragraph gaps

    // Apply sanitizer to clean up the final output
    const clean = sanitizeForOutput(normalized, { breaks: breaks as 'none' | 'short' | 'full' });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(clean);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
