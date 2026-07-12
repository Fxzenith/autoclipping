# YT Clipper - System Prompt & Guidelines

This project is a content engine for clipping YouTube videos into shorts.

## 🎯 Final Stack
- **Intelligence Layer**: Claude (Clip selection, hooks, reasoning)
- **Transcript Layer**: `youtube-transcript-api` (Python)
- **Extraction Layer**: `yt-dlp` + FFmpeg (Download + cut clips at 720p)
- **Rendering Layer**: FFmpeg (Burn in timed subtitles)

## 📁 Project Structure
```
project_root/
├── python/
│   └── transcript.py       # Fetches transcript
├── data/
│   ├── transcript.json   # {video_id, source_url, transcript: [{start, end, text}]}
│   ├── clips.json        # {clips: [{start, end, title, hook}]}
│   └── clips_review.md  # Human-readable review for approval
├── video/
│   └── full.mp4         # Full video (downloads here)
├── assets/
│   └── clip_XX.mp4      # Extracted clips (720p)
├── Outputs/
│   └── XX_*.mp4         # Final rendered videos (720p with subtitles)
├── scripts/
│   ├── extract.js # yt-dlp + FFmpeg wrapper (720p)
│   ├── render.js # Copy clips to Outputs
│   ├── add_subtitles.js # Burn subtitles into video
├── marketing pipeline/
│   ├── post_to_facebook.js # Post videos to Facebook Page
│   └── test_facebook.js # Test Facebook API connection
├── .env # Facebook credentials (DO NOT COMMIT)
└── main.js # Main orchestrator
```

## 🔗 Pipeline & Workflow
```
1. Run: node main.js <youtube_url>
2. transcript.json created automatically
3. Create clips.json + clips_review.md
4. Run: node main.js <youtube_url> --approve
5. Video downloaded + clips extracted
6. Clips copied to Outputs/
7. Run: node scripts/add_subtitles.js ← Add text overlays
8. Run: node "marketing pipeline/post_to_facebook.js" ← Post to Facebook (optional)
```

## 📋 Important File Naming

### Required JSON Keys
- `transcript.json`: `{video_id, source_url, transcript: [{start, end, text}]}`
- `clips.json`: `{clips: [{start, end, title, hook}]}`

### Example `clips.json`:
```json
{
  "clips": [
    {
      "start": 44.8,
      "end": 57.36,
      "title": "Talk Less, Be Powerful",
      "hook": "Talking less creates an aura of power."
    }
  ]
}
```

### Review File
- Use `data/clips_review.md` NOT `review.md` or `data/review.md`

### Clips Numbering
- FFmpeg outputs: `clip_01.mp4`, `clip_02.mp4`, etc. (padStart 2)
- Assets folder: `assets/clip_01.mp4`
- Outputs folder: `Outputs/01_title_here.mp4`

## 🚀 Commands

### Full Pipeline
```bash
# Step 1: Fetch transcript
node main.js "https://youtu.be/VIDEO_ID"

# Step 2: Claude creates clips.json + clips_review.md, then approve
node main.js "https://youtu.be/VIDEO_ID" --approve

# Full pipeline with auto-post to Facebook
node main.js "https://youtu.be/VIDEO_ID" --approve --facebook

# Or manually run each step
python python/transcript.py "https://youtu.be/VIDEO_ID"
node scripts/extract.js "https://youtu.be/VIDEO_ID"
node scripts/render.js
node "marketing pipeline/post_to_facebook.js"
```

### Individual Scripts
```bash
python python/transcript.py <url> # Fetch transcript
node scripts/extract.js <url> # Download + cut
node scripts/render.js # Copy to Outputs
node scripts/add_subtitles.js # Burn subtitles
node "marketing pipeline/post_to_facebook.js" # Post to Facebook Page
node "marketing pipeline/test_facebook.js" # Test Facebook connection
```

### Individual Scripts
```bash
python python/transcript.py <url>              # Fetch transcript
node scripts/extract.js <url>                 # Download + cut
node scripts/render.js                        # Copy to Outputs
```

## ⚠️ Critical Pitfalls

### 1. Folder Name
- Use `video/` NOT `videos/`
- Scripts create `video/` directory automatically

### 2. Review File Location
- MUST be `data/clips_review.md`
- main.js checks for this exact filename

### 3. Asset File Extensions
- FFmpeg may output `.webm`, `.f399.mp4`, etc.
- extract.js finds the actual video file automatically

### 4. Required Fields in clips.json
- Every clip MUST have: `start`, `end`, `title`, `hook`
- Without title/hook, render fails silently

## 🔧 Package.json Scripts
```json
{
  "scripts": {
    "transcript": "python python/transcript.py",
    "extract": "node scripts/extract.js",
    "render": "node scripts/render.js",
    "subtitles": "node scripts/add_subtitles.js",
    "facebook": "node \"marketing pipeline/post_to_facebook.js\"",
    "start": "node main.js"
  }
}
```

## 📝 Adding Timed Subtitles to Clips
After running the pipeline, add subtitles that sync with voice:
```bash
node scripts/add_subtitles.js
```
This reads from `data/transcript.json` and `data/clips.json`, creates an SRT file with timing from the transcript, and **burns the subtitles directly into the video**. Text appears/disappears in sync with the spoken words.

## 📦 Dependencies
```json
{
  "dependencies": {
    "ffmpeg-static": "^5.0.0"
  }
}
```

## 🔑 Environment Variables
- Store in `.env` file at root (DO NOT COMMIT)
- `ELEVENLABS_API_KEY` (optional, for AI voiceovers)
- `FACEBOOK_APP_ID` - Your Facebook App ID
- `FACEBOOK_PAGE_ID` - Your Facebook Page ID
- `FACEBOOK_ACCESS_TOKEN` - Page Access Token with `pages_manage_posts` permission

### Getting Facebook Credentials
1. Create app at [developers.facebook.com](https://developers.facebook.com/)
2. Add Facebook Login product
3. Request permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
4. Get Page Access Token via Graph API Explorer
5. Add to `.env`

## ⚙️ Responsibility Split
- **Python**: Fetch transcript only
- **Claude**: Create clips.json + clips_review.md
- **Node.js**: Download, cut, render

## ✅ Verification Checklist
When running a new session:
- [ ] Check `data/clips.json` has all fields (start, end, title, hook)
- [ ] Check `data/clips_review.md` exists (not review.md)
- [ ] Check `video/` folder (not videos/)
- [ ] Check `assets/clip_01.mp4` exists before render
- [ ] Use `--approve` flag for auto-approval
- [ ] Check `.env` has valid `FACEBOOK_ACCESS_TOKEN` before posting
