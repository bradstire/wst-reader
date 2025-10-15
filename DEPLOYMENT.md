# Vercel Deployment Guide

## Prerequisites

1. **GitHub Repository**: Push this code to a GitHub repository
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
3. **OpenAI API Key**: Get one from [platform.openai.com](https://platform.openai.com)

## Deployment Steps

### 1. Push to GitHub

```bash
git add .
git commit -m "Add Vercel cloud storage support"
git push origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Framework: Next.js (auto-detected)
5. Click "Deploy"

### 3. Configure Environment Variables

In your Vercel project dashboard:

1. Go to Settings → Environment Variables
2. Add these variables:

```
OPENAI_API_KEY=sk-your-actual-openai-key-here
BLOB_READ_WRITE_TOKEN=vercel-will-provide-this
```

**Note**: Vercel will automatically provision the `BLOB_READ_WRITE_TOKEN` when you add the `@vercel/blob` dependency. You can also create a manual token in the Vercel dashboard under Storage → Blob.

### 4. Test the Deployment

1. Visit your deployed URL
2. Select a zodiac sign
3. Click "Generate"
4. Wait for the reading to complete
5. Test both download buttons

## Expected Behavior

- ✅ Generate button creates new readings via OpenAI
- ✅ Files are stored in Vercel Blob Storage (not local disk)
- ✅ UI streams the reading from cloud storage
- ✅ Download buttons work with timestamped filenames
- ✅ Files include proper headers: `[ZODIAC: Sign]` and `[GENERATED_AT: timestamp]`

## Troubleshooting

### Generation Timeout
If generation takes longer than 5 minutes, consider upgrading to Vercel Pro for longer function timeouts.

### Blob Storage Issues
- Ensure `BLOB_READ_WRITE_TOKEN` is set correctly
- Check Vercel dashboard for storage usage limits

### OpenAI API Issues
- Verify `OPENAI_API_KEY` is correct
- Check OpenAI dashboard for usage limits and billing

## File Structure

```
├── lib/
│   ├── storage.ts          # Vercel Blob Storage utilities
│   ├── templates.ts        # Template loading
│   ├── generate.ts         # Main generation logic
│   ├── postprocess.ts      # Header and naming utilities
│   └── withBreaks.ts       # Break tag application
├── pages/api/
│   ├── generate.ts         # Triggers generation
│   ├── reading-stream.ts   # Streams latest reading
│   └── download.ts         # Downloads files
└── vercel.json            # Vercel configuration
```
