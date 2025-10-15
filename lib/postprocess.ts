export function isoNow() {
  try { 
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); 
  } catch { 
    return new Date().toISOString(); 
  }
}

export function headerize(text: string, sign: string) {
  // Don't add headers to content - headers are only in filenames
  return text;
}

export function timestampedName(base: string, sign: string) {
  const ts = isoNow().replace(/:/g, '-');
  return `${base}__${sign}__${ts}.txt`;
}
