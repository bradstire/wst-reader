#!/usr/bin/env python3
# White Soul Tarot — prompt/generation script

# --- Imports (with debug hook) ---
import os, sys, time, yaml, random, textwrap, datetime, json, re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed  # NEW

print("[debug] generate_prompts.py starting...", flush=True)
time.sleep(0.1)

HERE = Path(__file__).parent
TEMPLATES = HERE / "templates"

# --- Tarot deck (Rider–Waite) ---
MAJORS = [
    "The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers",
    "The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance",
    "The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World"
]
SUITS = {
    "Wands": ["Ace of Wands","Two of Wands","Three of Wands","Four of Wands","Five of Wands","Six of Wands",
              "Seven of Wands","Eight of Wands","Nine of Wands","Ten of Wands","Page of Wands",
              "Knight of Wands","Queen of Wands","King of Wands"],
    "Cups": ["Ace of Cups","Two of Cups","Three of Cups","Four of Cups","Five of Cups","Six of Cups",
             "Seven of Cups","Eight of Cups","Nine of Cups","Ten of Cups","Page of Cups",
             "Knight of Cups","Queen of Cups","King of Cups"],
    "Swords": ["Ace of Swords","Two of Swords","Three of Swords","Four of Swords","Five of Swords","Six of Swords",
               "Seven of Swords","Eight of Swords","Nine of Swords","Ten of Swords","Page of Swords",
               "Knight of Swords","Queen of Swords","King of Swords"],
    "Pentacles": ["Ace of Pentacles","Two of Pentacles","Three of Pentacles","Four of Pentacles","Five of Pentacles","Six of Pentacles",
                  "Seven of Pentacles","Eight of Pentacles","Nine of Pentacles","Ten of Pentacles","Page of Pentacles",
                  "Knight of Pentacles","Queen of Pentacles","King of Pentacles"]
}
DECK = MAJORS + sum(SUITS.values(), [])

# helpers
def base_title(s):
    """Extract base title, ignoring reversed suffix."""
    return re.sub(r'\s*,\s*reversed\.?$', '', s, flags=re.IGNORECASE).strip()

def orient(name, reversed_prob=0.5):
    if random.random() < reversed_prob:
        return f"{name}, reversed"
    return name

def draw_one(deck, reversed_prob=0.5):
    """Draw one card from deck and apply orientation."""
    if not deck:
        raise ValueError("Deck is empty")
    card = deck.pop()
    oriented = orient(card, reversed_prob)
    return {
        'title': oriented,
        'reversed': ', reversed' in oriented.lower()
    }

def draw_spread(deck, reversed_prob=0.5):
    """Draw 5 unique cards by base title, regardless of orientation."""
    chosen = []
    used = set()
    
    # Create a working copy of the deck
    working_deck = deck.copy()
    random.shuffle(working_deck)
    
    while len(chosen) < 5:
        if not working_deck:
            raise ValueError("Not enough unique cards in deck")
        
        pick = draw_one(working_deck, reversed_prob)
        key = base_title(pick['title'])
        
        if key in used:
            continue  # reject duplicates regardless of orientation
        
        used.add(key)
        chosen.append(pick)
    
    return chosen

def load_config():
    cfg_path = HERE / "config.yaml"
    with open(cfg_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg

# Global spread lock - persists across all chapters
SPREAD_LOCK = None

def choose_spread(cfg):
    """Lock 5 unique cards; apply approximate reversal ratio (v2.7)."""
    global SPREAD_LOCK
    
    if SPREAD_LOCK is not None:
        # Spread already locked, return it
        return [card['title'] for card in SPREAD_LOCK]
    
    reversed_prob = float(cfg.get("reversal_ratio", 0.5))
    deck = DECK.copy()
    
    # Draw 5 unique cards by base title
    SPREAD_LOCK = draw_spread(deck, reversed_prob)
    
    # Log the locked spread
    titles = [card['title'] for card in SPREAD_LOCK]
    print(f"[spread-lock] {' | '.join(titles)}")
    
    return titles

def chapter_card_for(idx):
    """Get the card for a specific chapter (1-5)."""
    if SPREAD_LOCK is None:
        raise ValueError("Spread not locked yet")
    
    if not (1 <= idx <= 5):
        raise ValueError(f"Chapter index must be 1-5, got {idx}")
    
    card = SPREAD_LOCK[idx - 1]
    if not card:
        raise ValueError(f'Spread lock missing index {idx}')
    
    return card

def draw_clarifier(deck, used_titles, max_clarifiers=2):
    """Draw a clarifier that doesn't conflict with spread or previous clarifiers."""
    if len(used_titles) >= max_clarifiers:
        return None
    
    working_deck = deck.copy()
    random.shuffle(working_deck)
    
    while working_deck:
        card = working_deck.pop()
        base = base_title(card)
        
        # Skip if already used in spread or previous clarifiers
        if base in used_titles:
            continue
        
        used_titles.add(base)
        return card
    
    return None

def card_line(card):
    return f"{card}"

def write_prompt(ch_num, spread, cfg, out_dir):
    # For chapters 2-5, enforce the locked spread
    if ch_num in (2, 3, 4, 5):
        locked_card = chapter_card_for(ch_num)
        expected_title = locked_card['title']
        
        # Verify the spread matches the locked card
        if spread[ch_num - 1] != expected_title:
            raise ValueError(f"Chapter {ch_num} card mismatch: expected '{expected_title}', got '{spread[ch_num - 1]}'")
    
    c1, c2, c3, c4, c5 = spread
    
    # Handle clarifiers with uniqueness enforcement
    clarifiers = "none"
    if ch_num == 1:  # Only generate clarifiers at CH01
        used_titles = {base_title(card['title']) for card in SPREAD_LOCK}
        clarifier_cards = []
        
        # Draw up to 2 clarifiers
        for _ in range(2):
            clarifier = draw_clarifier(DECK, used_titles)
            if clarifier:
                clarifier_cards.append(clarifier)
            else:
                break
        
        if clarifier_cards:
            clarifiers = " | ".join(clarifier_cards)
    
    sign = cfg.get("sign", "Gemini")
    date_anchor = cfg.get("date_anchor", "first week of October — starting at 11:11")

    lines = {
        1: card_line(c1),
        2: card_line(c2),
        3: card_line(c3),
        4: card_line(c4),
        5: card_line(c5),
    }

    # --- select template by chapter (7-chapter structure) ---
    if ch_num == 1:
        tpl = (TEMPLATES / "01.txt").read_text(encoding="utf-8")
        body = tpl.format(
            c1=c1, c2=c2, c3=c3, c4=c4, c5=c5,
            clarifiers=clarifiers,
            sign=sign,
            date_anchor=date_anchor,
            card1_line=lines[1],
        )
    elif ch_num in (2, 3, 4, 5):
        tpl = (TEMPLATES / f"{ch_num:02d}.txt").read_text(encoding="utf-8")
        body = tpl.format(
            c1=c1, c2=c2, c3=c3, c4=c4, c5=c5,
            clarifiers=clarifiers,
            **{f"card{ch_num}_line": lines[ch_num]},
        )
    elif ch_num == 6:
        tpl = (TEMPLATES / "callback.txt").read_text(encoding="utf-8")
        body = tpl.format(
            c1=c1, c2=c2, c3=c3, c4=c4, c5=c5,
            clarifiers=clarifiers,
        )
    elif ch_num == 7:
        tpl = (TEMPLATES / "07.txt").read_text(encoding="utf-8")
        body = tpl.format(
            c1=c1, c2=c2, c3=c3, c4=c4, c5=c5,
            clarifiers=clarifiers,
        )
    else:
        raise ValueError(f"Chapter {ch_num} is out of range for 7-chapter run.")

    out_path = out_dir / f"CH{ch_num:02d}_prompt.txt"
    out_path.write_text(body, encoding="utf-8")
    return out_path

# ---------
# Sanitizer
# ---------
CLOSER_RE = re.compile(r"\n+\s*(OK\.|Okay\.|Alright\.)\s*$", re.IGNORECASE)

def sanitize_trailing_closer(text: str) -> str:
    if not text:
        return text
    return CLOSER_RE.sub(lambda m: " " + m.group(1), text.rstrip())

REACTIONS = ["Whoa.", "Hm.", "Huh??", "Oh my God", "Sheesh."]

def rotate_oh_wow(text: str) -> str:
    pat = re.compile(r'^(?P<cardline>.+?\.)\s+Oh wow\.', flags=re.MULTILINE|re.DOTALL)
    if pat.search(text):
        replacement = random.choice(REACTIONS)
        return pat.sub(rf"\g<cardline> {replacement}", text, count=1)
    return text

META_SCRUB_RE = re.compile(r'^\[[A-Z]+:[^\]]*\]\s*$', flags=re.MULTILINE)

# ---- Break ruleset post-processor ----
RANGE_0_2 = [".5s", "0.6s", "1s", "1.7s", "2s"]
RANGE_2_5 = ["2s", "2.4s", "3s", "3.3s", "4.6s", "5s"]
RANGE_5_10 = ["5s", "6.2s", "7s", "8.5s", "9.4s", "10s"]
RANGE_10_12 = ["10s", "10.7s", "11s", "11.8s", "12s"]

def _bt(tag_seconds: str) -> str:
    return f'<break time="{tag_seconds}" />'

def _pick(seq):
    return random.choice(seq)

CARD_NAME_RE = re.compile(
    r"^(?:[A-Z][^\n]+?)(?:, reversed)?\.\s*(?:Whoa\.|Hm\.|Huh\?\?|Oh my god,|Sheesh\.)?",
    flags=re.MULTILINE
)

def _insert_between_cards(text: str) -> str:
    lines = text.splitlines()
    out = []
    first_card_seen = False
    for ln in lines:
        if CARD_NAME_RE.match(ln):
            if first_card_seen:
                out.append(_bt(_pick(RANGE_5_10)))
            first_card_seen = True
        out.append(ln)
    return "\n".join(out)

OUTRO_RE = re.compile(r"^(Now, if this resonated[^\n]*)", flags=re.MULTILINE|re.IGNORECASE)

def _insert_outro_break(text: str) -> str:
    return OUTRO_RE.sub(lambda m: _bt(_pick(RANGE_10_12)) + " " + m.group(1), text, count=1)

def _apply_paragraph_breaks(text: str, p75_2_5=True) -> str:
    paras = text.split("\n\n")
    new_paras = []
    for p in paras:
        if not p.strip():
            continue
        cat = RANGE_2_5 if (random.random() < 0.75 if p75_2_5 else True) else RANGE_0_2
        if cat is True:
            cat = RANGE_2_5
        new_paras.append(p.rstrip() + " " + _bt(_pick(cat)))
    return "\n\n".join(new_paras)

def _sprinkle_micro_breaks(text: str, every_n_sentences: int = 5) -> str:
    parts = re.split(r'(\. )(?![^<]*</?break)', text)
    if len(parts) < 3:
        return text
    for i in range(0, len(parts)-1, 2*every_n_sentences):
        parts[i] = parts[i] + " " + _bt(_pick(RANGE_0_2))
    return "".join(parts)

def apply_break_ruleset(full_text: str, *, micro_sprinkles=True) -> str:
    t = full_text
    t = _insert_between_cards(t)
    t = _insert_outro_break(t)
    t = _apply_paragraph_breaks(t)
    if micro_sprinkles:
        t = _sprinkle_micro_breaks(t, every_n_sentences=5)
    return t

def scrub_bracketed_meta(text: str) -> str:
    return META_SCRUB_RE.sub('', text).strip()

def sanitize_for_output(src: str, breaks_mode: str = "none") -> str:
    """Sanitize text for clean output, removing debug markers and formatting."""
    s = src

    # Remove chapter markers like "[CH01] ———" and any underline ruler lines
    s = re.sub(r'^\[CH\d{2}\][^\n]*\n?', '', s, flags=re.MULTILINE)
    s = re.sub(r'^[\s—-]{3,}\s*$', '', s, flags=re.MULTILINE)

    # Remove bracketed process/log lines like "[child] [debug] ..." or "[ok] ..."
    s = re.sub(r'^\[[^\]]+\](?:\s+\[[^\]]+\])*\s.*$', '', s, flags=re.MULTILINE)

    # Optionally remove <break> tags when breaks=none
    if breaks_mode == 'none':
        s = re.sub(r'<break\s+time=[\'"][^\'"]+[\'"]\s*\/>', '', s)

    # Collapse excessive blank lines and trim
    s = re.sub(r'\n{3,}', '\n\n', s).strip()

    return s

# --- concurrent generation helper (NEW) ---
def generate_one(ch_num, out_dir: Path, cfg: dict, prompt_text: str):
  try:
    import openai
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
      print("OPENAI_API_KEY not set — skipping generation.")
      return None
    client = openai.OpenAI(api_key=api_key)
    model = cfg.get("openai_model", "gpt-4o")  # fallback aligned with your config
    temperature = float(cfg.get("temperature", 0.6))

    resp = client.chat.completions.create(
      model=model,
      temperature=temperature,
      messages=[
        {"role": "system",
         "content": "You are ANGELA for White Soul Tarot 2. Follow the script and tone rules exactly as provided in the prompt text."},
        {"role": "user", "content": prompt_text}
      ]
    )
    text = resp.choices[0].message.content or ""
    text = sanitize_trailing_closer(text)
    text = rotate_oh_wow(text)
    text = scrub_bracketed_meta(text)

    outp = out_dir / f"CH{ch_num:02d}_generated.txt"
    outp.write_text(text, encoding="utf-8")
    print(f"[ok] Wrote CH{ch_num:02d}_generated.txt")
    return outp
  except Exception as e:
    print(f"[warn] API generation failed for CH{ch_num:02d}: {e}")
    return None

# legacy single-call path (kept for compatibility; unused when we use concurrency)
def maybe_generate_with_api(ch_num, prompt_text, out_dir, cfg):
    if cfg.get("mode", "prompts") != "generate":
        return None
    try:
        import openai
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            print("OPENAI_API_KEY not set — skipping generation.")
            return None
        client = openai.OpenAI(api_key=api_key)
        model = cfg.get("openai_model", "gpt-4o")
        temperature = float(cfg.get("temperature", 0.6))

        resp = client.chat.completions.create(
            model=model,
            temperature=temperature,
            messages=[
                {"role": "system",
                 "content": "You are ANGELA for White Soul Tarot 2. Follow the script and tone rules exactly as provided in the prompt text."},
                {"role": "user", "content": prompt_text}
            ]
        )
        text = resp.choices[0].message.content or ""
        text = sanitize_trailing_closer(text)
        text = rotate_oh_wow(text)
        text = scrub_bracketed_meta(text)
        outp = out_dir / f"CH{ch_num:02d}_generated.txt"
        outp.write_text(text, encoding="utf-8")
        print(f"[ok] Wrote CH{ch_num:02d}_generated.txt")
        return outp
    except Exception as e:
        print(f"[warn] API generation failed for CH{ch_num:02d}: {e}")
        return None

def resolve_chapter_list(cfg):
    chapters = cfg.get("chapters", "all")
    if chapters == "all":
        return [1,2,3,4,5,6,7]
    vals = []
    for x in chapters:
        try:
            vals.append(int(x))
        except Exception:
            pass
    vals = sorted({c for c in vals if 1 <= c <= 7})
    return vals or [1,2,3,4,5,6,7]

# -----------------------
# Auto-stitching support
# -----------------------

def _strip_meta_headers(text: str) -> str:
    lines = text.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and (lines[0].startswith("[STATE:") or lines[0].startswith("[LEN:")):
        lines.pop(0)
    if lines and not lines[0].strip():
        lines.pop(0)
    return "\n".join(lines).strip()

def stitch_reading(out_dir: Path, chapters: list[int], breaks_mode: str = "none") -> Path:
    gen_paths = [out_dir / f"CH{ch:02d}_generated.txt" for ch in chapters]
    use_generated = all(p.exists() for p in gen_paths)
    files = gen_paths if use_generated else [out_dir / f"CH{ch:02d}_prompt.txt" for ch in chapters]

    stitched = out_dir / "FULL_READING.txt"
    written = 0
    with stitched.open("w", encoding="utf-8") as out:
        for p in files:
            if not p.exists():
                continue
            text = _strip_meta_headers(p.read_text(encoding="utf-8"))
            text = sanitize_trailing_closer(text)
            text = rotate_oh_wow(text)
            text = scrub_bracketed_meta(text)
            if not text:
                continue
            out.write(text)
            out.write("\n\n")
            written += 1
    
    # Apply final sanitization to the complete stitched file
    if stitched.exists():
        full_text = stitched.read_text(encoding="utf-8")
        clean_text = sanitize_for_output(full_text, breaks_mode)
        stitched.write_text(clean_text, encoding="utf-8")
    
    print(f"[ok] Stitched {written} files → {stitched.name}")
    return stitched

def is_full_run(chapters: list[int]) -> bool:
    return sorted(chapters) == [1,2,3,4,5,6,7]

def main():
    print("[debug] entered main()", flush=True)

    cfg = load_config()
    if cfg.get("seed") is not None:
        random.seed(cfg["seed"])

    out_dir = (HERE / cfg.get("output_dir", "output"))
    out_dir.mkdir(parents=True, exist_ok=True)

    spread = choose_spread(cfg)
    print(f"[info] Locked spread: {spread}")

    # Check for single chapter mode from environment
    single_chapter = os.environ.get("WST_CHAPTER")
    if single_chapter:
        try:
            ch_num = int(single_chapter)
            if 1 <= ch_num <= 7:
                chapters = [ch_num]
                print(f"[info] Single chapter mode: CH{ch_num:02d}")
            else:
                chapters = resolve_chapter_list(cfg)
        except ValueError:
            chapters = resolve_chapter_list(cfg)
    else:
        chapters = resolve_chapter_list(cfg)

    # 1) Always write prompts first (fast)
    prompts_by_ch = {}
    for ch in chapters:
        p = write_prompt(ch, spread, cfg, out_dir)
        prompts_by_ch[ch] = p
        print(f"[ok] Wrote {p.name}")

    # 2) Generate sequentially if enabled (removed concurrency)
    mode = os.environ.get("WST_MODE") or cfg.get("mode", "prompts")
    if mode == "generate":
        print(f"[info] Starting sequential generation for chapters: {chapters}")
        
        for ch in chapters:
            try:
                print(f"[info] Generating CH{ch:02d}...")
                generate_one(ch, out_dir, cfg, prompts_by_ch[ch].read_text(encoding="utf-8"))
            except Exception as e:
                print(f"[warn] CH{ch:02d} generation error: {e}")
                # Continue to next chapter instead of failing
    else:
        print("[info] mode != generate — prompts only (no API calls)")

    # 3) Auto-stitch when running the full set (only if not single chapter mode)
    if not single_chapter and is_full_run(chapters):
        breaks_mode = (os.environ.get("WST_BREAKS_MODE") or str(cfg.get("breaks_output", "none"))).lower()
        stitched_path = stitch_reading(out_dir, chapters, breaks_mode)

        # Optional: write a with-breaks version based on env or config
        if breaks_mode in ("with_breaks", "both"):
            full_text = stitched_path.read_text(encoding="utf-8")
            full_text = apply_break_ruleset(full_text, micro_sprinkles=True)
            out_with_breaks = stitched_path.with_name("FULL_READING_with_breaks.txt")
            out_with_breaks.write_text(full_text, encoding="utf-8")
            print(f"[ok] Wrote {out_with_breaks.name} with speech breaks")

print("[debug] about to call main()", flush=True)
if __name__ == "__main__":
    main()
