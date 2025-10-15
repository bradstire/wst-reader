import { put, list, del } from '@vercel/blob';

const OUTPUT_PREFIX = 'wst-output/'; // a folder-ish prefix

// Check if blob storage is configured
function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function saveTextBlob(name: string, text: string) {
  if (!isBlobConfigured()) {
    throw new Error('Vercel Blob Storage is not configured. Please set BLOB_READ_WRITE_TOKEN environment variable.');
  }
  
  const key = OUTPUT_PREFIX + name;
  const { url } = await put(key, text, { 
    access: 'public', 
    contentType: 'text/plain; charset=utf-8',
    token: process.env.BLOB_READ_WRITE_TOKEN 
  });
  return { key, url };
}

export async function readTextBlob(name: string) {
  if (!isBlobConfigured()) {
    throw new Error('Vercel Blob Storage is not configured. Please set BLOB_READ_WRITE_TOKEN environment variable.');
  }
  
  const key = OUTPUT_PREFIX + name;
  const res = await fetch(`https://blob.vercel-storage.com/${key}`);
  if (!res.ok) throw new Error(`Blob read failed: ${name}`);
  return await res.text();
}

export async function latestByPrefix(prefix: string) {
  if (!isBlobConfigured()) {
    throw new Error('Vercel Blob Storage is not configured. Please set BLOB_READ_WRITE_TOKEN environment variable.');
  }
  
  const items = await list({ 
    prefix: OUTPUT_PREFIX + prefix, 
    limit: 50,
    token: process.env.BLOB_READ_WRITE_TOKEN 
  });
  // Sort by uploadedAt desc
  const sorted = items.blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  return sorted[0] || null;
}

export async function deleteOldFiles(prefix: string, keepCount: number = 5) {
  if (!isBlobConfigured()) {
    console.warn('[storage] Blob storage not configured, skipping cleanup');
    return;
  }
  
  const items = await list({ 
    prefix: OUTPUT_PREFIX + prefix, 
    limit: 100,
    token: process.env.BLOB_READ_WRITE_TOKEN 
  });
  const sorted = items.blobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  
  // Keep only the most recent files
  const toDelete = sorted.slice(keepCount);
  for (const blob of toDelete) {
    await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  }
}
