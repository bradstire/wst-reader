// lib/prompts/angelCoreV5_clean.ts
import fs from "fs";
import path from "path";

let _cache: string | null = null;

export function loadAngelaCoreV5Clean(): string {
  if (_cache) return _cache;
  const p = path.resolve(process.cwd(), "lib/prompts/angelCoreV5_clean.txt");
  _cache = fs.readFileSync(p, "utf8");
  return _cache;
}

