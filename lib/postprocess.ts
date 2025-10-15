export function isoNow() {
  try { 
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); 
  } catch { 
    return new Date().toISOString(); 
  }
}

export function headerize(text: string, sign: string) {
  if (text.startsWith('[ZODIAC:')) return text;
  return `[ZODIAC: ${sign}]\n[GENERATED_AT: ${isoNow()}]\n\n${text}`;
}

export function timestampedName(base: string, sign: string) {
  const ts = isoNow().replace(/:/g, '-');
  return `${base}__${sign}__${ts}.txt`;
}
