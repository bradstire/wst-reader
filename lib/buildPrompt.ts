import fs from "fs";
import path from "path";

export interface SpreadInput {
  sign: string;
  date_anchor: string;
  cards: string[];
  chapter: number;
}

export function buildPrompt({ sign, date_anchor, cards, chapter }: SpreadInput): string {
  const root = path.resolve(process.cwd(), "lib/templates");
  const fname = chapter === 6 ? "callback.txt" : chapter === 7 ? "07.txt" : `${String(chapter).padStart(2,"0")}.txt`;
  const tplPath = path.join(root, fname);
  const template = fs.readFileSync(tplPath, "utf8");

  const map: Record<string,string> = {
    c1: cards[0],
    c2: cards[1],
    c3: cards[2],
    c4: cards[3],
    c5: cards[4],
    clarifiers: "none",
    sign,
    date_anchor,
    card1_line: cards[0],
    card2_line: cards[1],
    card3_line: cards[2],
    card4_line: cards[3],
    card5_line: cards[4],
  };

  return template.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? "");
}
