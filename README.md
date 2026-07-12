# 🎬 YT Clipper - YouTube Shorts Generator

A modular, reusable content engine for converting long-form YouTube videos into short-form vertical clips optimized for social media (YouTube Shorts, TikTok, Reels).

## 🎯 What It Does

1. **📥 Fetches transcripts** from YouTube videos (timestamped)
2. **🤖 AI-powered selection** uses Claude to identify high-retention clips with compelling hooks
3. **🎥 Automated extraction** downloads videos and cuts clips using `yt-dlp` + FFmpeg (720p)
4. **🔥 Burned-in subtitles** creates timed text overlays synced with voice using FFmpeg
5. **✅ Human approval** ensures quality before processing with a markdown review step

## 🏗️ Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Intelligence** | Claude (API) | Clip selection, hooks, reasoning |
| **Transcripts** | `youtube-transcript-api` (Python) | Fetch timestamped transcripts |
| **Video Extraction** | `yt-dlp` + FFmpeg | Download and cut clips at 720p |
| **Subtitles** | FFmpeg ASS/SRT | Burn timed subtitles into video |
| **Orchestration** | Node.js | Pipeline coordination |

### Folder Structure

```
project_root/
├── python/
│   └── transcript.py          # Fetch YouTube transcripts
├── scripts/
│   ├── extract.js             # yt-dlp + FFmpeg wrapper
│   └── render.js              # Copy clips to Outputs
├── data/
│   ├── transcript.json        # Raw transcript output
│   ├── clips.json            # Structured clips (machine-readable)
│   └── clips_review.md        # Human-readable review
├── assets/                    # Extracted clip video files
├── Outputs/                   # Final rendered videos
├── video/                    # Full downloaded video
├── projects/                  # Remotion project (optional)
├── remotion/                  # Remotion components
├── main.js                    # Main orchestrator
├── config.json                # Non-sensitive configuration
├── package.json               # Node.js dependencies
└── requirements.txt           # Python dependencies
```
├── remotion/                  # Reusable Remotion components
├── main.js                    # Main orchestrator
├── config.json                # Non-sensitive configuration
├── .env.example               # Environment variables template
├── package.json               # Node.js dependencies
└── requirements.txt           # Python dependencies
```

## 🚀 Quick Start

### 1. Clone & Install

```bash
# Install dependencies
npm install
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```

### 2. Run the Pipeline

```bash
# Basic usage
node main.js "https://www.youtube.com/watch?v=VIDEO_ID"

# Auto-approve (skip manual review)
node main.js "https://www.youtube.com/watch?v=VIDEO_ID" --approve
```

### 3. Pipeline Steps

The orchestrator (`main.js`) will:

1. ✅ **Fetch Transcript** - Downloads timestamped transcript from YouTube
   ```bash
   python python/transcript.py --url "https://www.youtube.com/watch?v=VIDEO_ID"
   ```
   Output: `data/transcript.json`

2. 🤖 **Claude Clip Selection** - **YOU** run Claude to analyze the transcript
   - Read `data/transcript.json`
   - Ask Claude to identify 5-10 high-retention clips
   - Claude outputs:
   - `data/clips.json` (machine-readable)
   - `data/clips_review.md` (human-readable timestamps)

   **Example Prompt for Claude:**
   ```
   Analyze this YouTube transcript and select 5-10 clips for YouTube Shorts.
   Each clip should be 10-25 seconds (ideal ~15s).
   For each clip, provide:
   - start (seconds)
   - end (seconds)
   - title (one-liner)
   - hook (compelling first-3-second quote)
   - reason (why it will perform well)
   
   Output as JSON in this format:
   {
     "clips": [
       {
         "start": 120,
         "end": 135,
         "title": "Discipline Truth",
         "hook": "This is why most people fail",
         "reason": "Strong contrarian hook, concise takeaway"
       }
     ]
   }
   ```

3. ✓ **Review & Approval** - Confirm timestamps in `data/clips_review.md`
   ```bash
   # The script will ask for confirmation before proceeding
   Approve and continue? (yes/no):
   ```

4. 🎥 **Download & Extract** - Downloads full video, cuts clips
   ```bash
   node scripts/extract.js "https://www.youtube.com/watch?v=VIDEO_ID"
   ```
   Output: `assets/clip_01.mp4`, `assets/clip_02.mp4`, etc.

5. 🎨 **Render Videos** - Renders final shorts with Remotion
   ```bash
   node scripts/render.js
   ```
   Output: `Outputs/` (final `.mp4` files ready to upload)

### 6. 📘 Post to Facebook (Optional)
```bash
# Post videos from Outputs/ to your Facebook Page
node "marketing pipeline/post_to_facebook.js"

# Or include in full pipeline
node main.js "https://www.youtube.com/watch?v=VIDEO_ID" --approve --facebook
```

**Facebook Setup:**
1. Create a Facebook App at [developers.facebook.com](https://developers.facebook.com/)
2. Add Facebook Login product and request these permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
3. Generate a Page Access Token via Graph API Explorer
4. Add to `.env`:
```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_PAGE_ID=your_page_id
FACEBOOK_ACCESS_TOKEN=your_page_access_token
```

## 📋 Detailed Scripts Reference

### `python/transcript.py`

Fetches timestamped transcripts from YouTube.

```bash
# By URL
python python/transcript.py --url "https://www.youtube.com/watch?v=VIDEO_ID"

# By video ID
python python/transcript.py --id "VIDEO_ID"

# Custom output path
python python/transcript.py --url "..." --out "data/my_transcript.json"
```

**Output Example:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "transcript": [
    {
      "start": 0.5,
      "end": 2.3,
      "text": "Today we're talking about discipline"
    },
    {
      "start": 2.5,
      "end": 5.1,
      "text": "Most people fail because of one reason"
    }
  ]
}
```

### `data/clips.json`

Machine-readable JSON defining clips to extract. **Created by Claude.**

```json
{
  "clips": [
    {
      "start": 2.5,
      "end": 17.5,
      "title": "Why Most People Fail",
      "hook": "Most people fail because of one reason",
      "reason": "Strong hook within first 3 seconds, clear insight"
    },
    {
      "start": 45.0,
      "end": 60.0,
      "title": "The Success Formula",
      "hook": "Here's the one thing that actually works",
      "reason": "Actionable advice, high engagement potential"
    }
  ]
}
```

### `scripts/extract.js`

Downloads video with `yt-dlp`, cuts clips with FFmpeg.

```bash
node scripts/extract.js "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Dependencies:**
- `yt-dlp` (install: `pip install yt-dlp` or `brew install yt-dlp`)
- `ffmpeg` (install: `brew install ffmpeg` or `apt-get install ffmpeg`)

### `scripts/render.js`

Renders extracted clips with Remotion into final vertical shorts.

```bash
node scripts/render.js
```

**Requires:**
- Remotion project initialized at `projects/yt-shorts/`
- Assets extracted to `assets/`

## 🔧 Configuration

### `.env` File

Create a `.env` file for sensitive credentials:

```env
# ElevenLabs API Key (optional, for AI voiceovers)
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxx
```

**Do NOT commit `.env` to git.** A `.gitignore` entry is provided.

### `config.json`

Non-sensitive configuration (safe to commit):

```json
{
  "project": "YT Clipper",
  "version": "0.1.0",
  "voiceConfig": {
    "enabled": false,
    "provider": "elevenlabs",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",
    "voiceName": "Rachel"
  },
  "clipConfig": {
    "minDuration": 10,
    "maxDuration": 25,
    "idealDuration": 15
  },
  "remotion": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "durationInFrames": 900
  }
}
```

## 🎬 Remotion Setup (Advanced)

The project includes reusable Remotion components in `remotion/`:

- **`ShortClip.jsx`** - Single clip composition with captions and overlays
- **`Root.jsx`** - Remotion composition root
- **`utils.js`** - Helper functions to convert `clips.json` to Remotion props

### Initialize Remotion Project

```bash
# Create a new Remotion project
npx create-remotion-app projects/yt-shorts --typescript false

# Copy components
cp remotion/ShortClip.jsx projects/yt-shorts/src/
cp remotion/Root.jsx projects/yt-shorts/src/

# Update projects/yt-shorts/src/index.js
# Import and use Root component from Root.jsx

# Run preview
cd projects/yt-shorts
npx remotion preview

# Render individual clips
npx remotion render src/index.js YTShort --output ../../Outputs/clip.mp4
```

## 📝 Clip Selection Tips

For best results, Claude should select clips with:

✅ **Strong hooks** (first 1-3 seconds)
- "The #1 reason people fail is..."
- "I've never told anyone this before..."
- "Here's what nobody wants to admit..."

✅ **Emotional peaks**
- Surprising insights
- Contrarian takes
- Personal breakthroughs

✅ **Contextual completeness**
- Minimal dependence on earlier content
- Complete thought/sentence

✅ **Engagement density**
- High information density
- Clear/actionable takeaway
- Rhythm of delivery

❌ **Avoid**
- Long setups without payoff
- Slow-paced segments
- Content requiring prior context
- Filler or "umm"/"uh" heavy segments

## 🔗 API Dependencies

### YouTube Transcript API

```bash
pip install youtube-transcript-api
```

Fetches timestamped captions directly from YouTube. No API key required.

### yt-dlp

```bash
# macOS
brew install yt-dlp

# Linux
sudo apt-get install yt-dlp

# Windows (pip)
pip install yt-dlp
```

Latest YouTube downloader (successor to youtube-dl).

### FFmpeg

```bash
# macOS
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg

# Windows
choco install ffmpeg
```

Required for video cutting and re-encoding.

### Remotion

```bash
npm install remotion @remotion/cli
```

Modern framework for programmatic video generation.

## 🛠️ Troubleshooting

### "Module not found: youtube-transcript-api"
```bash
pip install youtube-transcript-api
```

### "yt-dlp: command not found"
```bash
pip install yt-dlp
# Or use: python -m yt_dlp
```

### "ffmpeg: command not found"
```bash
# macOS
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg

# Windows
choco install ffmpeg
```

### "Cannot find module 'remotion'"
```bash
npm install
npm install remotion @remotion/cli @remotion/google-fonts
```

### Remotion render fails
1. Ensure `projects/yt-shorts/` is initialized
2. Check that `ShortClip.jsx` is in `projects/yt-shorts/src/`
3. Verify assets exist in `assets/`
4. Run: `cd projects/yt-shorts && npx remotion preview` to test

## 📚 Project Workflow

```
1. Input YouTube URL
   ↓
2. Fetch Transcript (transcript.py)
   ↓
3. You: Run Claude on transcript.json
   ↓
4. Claude outputs clips.json + clips_review.md
↓
5. Review timestamps (clips_review.md)
   ↓
6. Approve in CLI
   ↓
7. Download + Extract (extract.js)
   ↓
8. Render Videos (render.js)
   ↓
9. Upload to YouTube Shorts / TikTok / Reels
```

## 📦 Directory Responsibilities

| Folder | Purpose |
|--------|---------|
| `data/` | Transcripts and clip definitions |
| `assets/` | Extracted clip videos (FFmpeg output) |
| `Outputs/` | Final rendered shorts (Remotion output) |
| `video/` | Full video downloaded by yt-dlp |
| `projects/yt-shorts/` | Remotion project (user-initialized) |
| `python/` | Python scripts (transcript fetching) |
| `scripts/` | Node.js scripts (download, cut, render) |
| `remotion/` | Reusable Remotion components |

## 🔐 Security

- **Never commit `.env`** - It contains API keys
- Use `.env.example` as a template
- Store sensitive config in `~/.bashrc` or `.zshrc` if needed
- Non-sensitive config lives in `config.json`

## 📄 License

This project is part of the YT Clipper content engine. See `AGENTS.md` for full system documentation.

---

**Questions?** Check `INTEGRATED.md` for system design or read individual script headers for usage details.
