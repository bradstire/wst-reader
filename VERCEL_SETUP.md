# Vercel Setup Instructions

## Step 1: Enable Blob Storage in Vercel

Before deploying, you need to enable Vercel Blob Storage for your project:

### Option A: Via Vercel Dashboard (Recommended)

1. Go to your Vercel project dashboard
2. Click on the **Storage** tab
3. Click **Create Database**
4. Select **Blob** from the options
5. Click **Create**

This will automatically create and set the `BLOB_READ_WRITE_TOKEN` environment variable for all environments.

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI if you haven't already
npm i -g vercel

# Link your project
vercel link

# Add blob storage
vercel blob create
```

## Step 2: Set Environment Variables

Go to your Vercel project settings → Environment Variables and add:

```
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
```

**Note**: `BLOB_READ_WRITE_TOKEN` will be automatically set when you create the Blob storage in Step 1.

## Step 3: Deploy

```bash
# Option 1: Deploy via Git
git add .
git commit -m "Add cloud storage support"
git push origin main
# Vercel will auto-deploy

# Option 2: Deploy via Vercel CLI
vercel --prod
```

## Troubleshooting

### Error: "No token found"

This means Blob Storage hasn't been set up. Follow Step 1 above to enable it.

### Error: "OPENAI_API_KEY not found"

Make sure you've added your OpenAI API key in the Environment Variables section.

### Check if Blob Storage is enabled:

1. Go to your Vercel dashboard
2. Navigate to Storage tab
3. You should see a Blob storage instance listed

## Verify Setup

After deployment, test the following:

1. ✅ Visit your deployed URL
2. ✅ Click "Generate" button
3. ✅ Wait for generation to complete
4. ✅ Verify text appears
5. ✅ Test both download buttons

## Environment Variables Checklist

- [ ] `BLOB_READ_WRITE_TOKEN` - Auto-set when you create Blob storage
- [ ] `OPENAI_API_KEY` - Must be manually set

## Additional Resources

- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
