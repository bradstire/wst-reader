export function sanitizeForOutput(src: string, opts?: { breaks?: 'none'|'short'|'full' }) {
  let s = src ?? '';

  // Remove debug metadata lines - more aggressive patterns
  s = s.replace(/^\[STATE:.*$/gm, '');
  s = s.replace(/^\[LEN:.*$/gm, '');
  s = s.replace(/^\[DO NOT PRINT.*$/gm, '');
  s = s.replace(/^\[OUTPUT RULES.*$/gm, '');
  s = s.replace(/^\[INPUTS.*$/gm, '');
  s = s.replace(/^\[INTRO Riff Rules.*$/gm, '');
  s = s.replace(/^\[METAPHOR GOVERNANCE.*$/gm, '');
  s = s.replace(/^\[GOAL.*$/gm, '');
  s = s.replace(/^\[VOICE & TONE.*$/gm, '');
  s = s.replace(/^\[CONTENT GUARDRAILS.*$/gm, '');
  s = s.replace(/^\[ENDING RULES.*$/gm, '');
  s = s.replace(/^\[RUNTIME GOVERNOR.*$/gm, '');
  s = s.replace(/^\[OUTPUT FORMAT.*$/gm, '');
  s = s.replace(/^\[BEGIN CHAPTER.*$/gm, '');
  s = s.replace(/^\[FINAL SELF-CHECK.*$/gm, '');
  
  // Remove chapter headers like "[CH01] …"
  s = s.replace(/^\[CH\d{2}\][^\n]*\n?/gm, '');
  // Remove ruler lines (—, -, etc.)
  s = s.replace(/^[\s—-]{3,}\s*$/gm, '');

  // Remove bracketed logs like "[child] [debug] foo"
  s = s.replace(/^\[[^\]]+\](?:\s+\[[^\]]+\])*\s.*$/gm, '');

  // Optionally remove <break> tags
  if (opts?.breaks === 'none') {
    s = s.replace(/<break\s+time=['"][^'"]+['"]\s*\/>/g, '');
  }

  // Normalize line breaks and keep paragraph spacing
  s = s.replace(/\r\n?/g, '\n');
  // collapse 3+ blank lines to 2
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
