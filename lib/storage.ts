import { put, list, del } from '@vercel/blob';
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_PREFIX = 'wst-output/'; // a folder-ish prefix
const LOCAL_OUTPUT_DIR = path.join(process.cwd(), 'output');

// Check if blob storage is configured
function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN !== 'your-blob-token-here';
}

export async function saveTextBlob(name: string, text: string) {
  if (!isBlobConfigured()) {
    // Fallback to local filesystem for development
    console.log(`[storage] Using local filesystem fallback for ${name}`);
    await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true });
    const filePath = path.join(LOCAL_OUTPUT_DIR, name);
    await fs.writeFile(filePath, text, 'utf8');
    return { key: name, url: `file://${filePath}` };
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
    // Fallback to local filesystem for development
    const filePath = path.join(LOCAL_OUTPUT_DIR, name);
    return await fs.readFile(filePath, 'utf8');
  }
  
  const key = OUTPUT_PREFIX + name;
  const res = await fetch(`https://blob.vercel-storage.com/${key}`);
  if (!res.ok) throw new Error(`Blob read failed: ${name}`);
  return await res.text();
}

export async function latestByPrefix(prefix: string) {
  if (!isBlobConfigured()) {
    // Fallback to local filesystem for development
    try {
      await fs.mkdir(LOCAL_OUTPUT_DIR, { recursive: true });
      const files = await fs.readdir(LOCAL_OUTPUT_DIR);
      const matchingFiles = files.filter(file => file.startsWith(prefix));
      if (matchingFiles.length === 0) return null;
      
      // Sort by modification time (newest first)
      const filesWithStats = await Promise.all(
        matchingFiles.map(async (file) => {
          const filePath = path.join(LOCAL_OUTPUT_DIR, file);
          const stats = await fs.stat(filePath);
          return { file, mtime: stats.mtime };
        })
      );
      
      const sorted = filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      const latest = sorted[0];
      return {
        pathname: latest.file,
        url: `file://${path.join(LOCAL_OUTPUT_DIR, latest.file)}`,
        uploadedAt: latest.mtime.toISOString()
      };
    } catch (error) {
      console.error('[storage] Error reading local files:', error);
      return null;
    }
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
