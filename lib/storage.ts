import { put, list, del } from '@vercel/blob';

const OUTPUT_PREFIX = 'wst-output/'; // a folder-ish prefix

export async function saveTextBlob(name: string, text: string) {
  const key = OUTPUT_PREFIX + name;
  const { url } = await put(key, text, { access: 'public', contentType: 'text/plain; charset=utf-8' });
  return { key, url };
}

export async function readTextBlob(name: string) {
  const key = OUTPUT_PREFIX + name;
  const res = await fetch(`https://blob.vercel-storage.com/${key}`);
  if (!res.ok) throw new Error(`Blob read failed: ${name}`);
  return await res.text();
}

export async function latestByPrefix(prefix: string) {
  const items = await list({ prefix: OUTPUT_PREFIX + prefix, limit: 50 });
  // Sort by uploadedAt desc
  const sorted = items.blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  return sorted[0] || null;
}

export async function deleteOldFiles(prefix: string, keepCount: number = 5) {
  const items = await list({ prefix: OUTPUT_PREFIX + prefix, limit: 100 });
  const sorted = items.blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  
  // Keep only the most recent files
  const toDelete = sorted.slice(keepCount);
  for (const blob of toDelete) {
    await del(blob.url);
  }
}
