export function sanitizeForOutput(src: string, opts?: { breaks?: 'none'|'short'|'full' }) {
  let s = src ?? '';

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
