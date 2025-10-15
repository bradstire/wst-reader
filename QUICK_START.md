# Quick Start: Deploy to Vercel

## 🚨 IMPORTANT: Enable Blob Storage First!

**Before deploying, you MUST enable Vercel Blob Storage:**

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Create a new project or select your existing project
3. Click **Storage** tab
4. Click **Create Database** → Select **Blob**
5. This automatically sets `BLOB_READ_WRITE_TOKEN`

## Then Deploy:

### 1. Push to GitHub (if not already done)
```bash
git add .
git commit -m "Add Vercel deployment support"
git push origin main
```

### 2. Import to Vercel
- Go to [vercel.com/new](https://vercel.com/new)
- Import your GitHub repository
- Framework: Next.js (auto-detected)

### 3. Set Environment Variables
In Vercel project settings → Environment Variables:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

### 4. Deploy
Click "Deploy" button

## ✅ Test Your Deployment

1. Visit your deployed URL
2. Select a zodiac sign
3. Click "Generate"
4. Wait ~2-3 minutes for generation
5. Verify download buttons work

## ⚠️ Common Issues

**Error: "No token found"**
- Solution: Enable Blob Storage in Step 1 above

**Error: "Generation failed"**
- Check OPENAI_API_KEY is set correctly
- Verify you have OpenAI API credits

**Timeout during generation**
- Generation takes 2-3 minutes (normal)
- If it times out, upgrade to Vercel Pro for longer function timeouts

## 📝 Notes

- First deployment may take longer
- Blob Storage is automatically configured
- Files are stored in cloud (not local filesystem)
- Each reading creates timestamped files
