# 🎬 YT Clipper — Face-Tracked Shorts Pipeline (v3)

Convert long-form YouTube videos into vertical 9:16 Shorts with **face-tracked reframe** and **synced, single-line, faded subtitles**.

## ✨ What It Does

1. **📥 Fetches transcripts** from YouTube (timestamped, via `youtube-transcript-api`)
2. **🤖 AI clip selection** — Claude identifies high-retention segments (10–25s each)
3. **🎥 Downloads & cuts clips** via `yt-dlp` + FFmpeg (720p source)
4. **👤 Face-tracked reframe** — MediaPipe BlazeFace detects the speaker, crops to 9:16 keeping the face in the upper third
5. **📝 Burned subtitles** — single-line, dark-backed, synced with speech rhythm, smooth fade in/out, positioned below the face

## 🏗 Pipeline

```
YouTube URL
    │
    ▼
[1] Transcript fetch (python/transcript.py)
    │
    ▼
[2] Claude clip selection → data/clips.json + clips_review.md
    │
    ▼
[3] Approval gate
    │
    ▼
[4] Download + cut clips (scripts/extract.js — yt-dlp + FFmpeg)
    │
    ▼
[5] Face-tracked vertical reframe (scripts/face_reframe.py — MediaPipe)
    │  → Outputs/NN_slug.mp4 (720×1280, unsubtitled)
    │
    ▼
[6] Burn subtitles (scripts/subtitles_oneline.py --face-track)
       → Outputs/NN_slug.mp4 (720×1280, subtitled)
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 14+ (`node -v`)
- **Python** 3.8+ (`python3 --version`)
- **uv** (Python package manager — `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **ffmpeg** (`apt-get install ffmpeg` / `brew install ffmpeg`)
- **yt-dlp** (installed via `uv sync`)

### Setup

```bash
git clone <repo-url> autoclipping
cd autoclipping
bash scripts/setup.sh        # installs npm deps, uv deps, downloads face model
cp .env.example .env         # add your API keys (optional)
```

### Run

```bash
# Full pipeline (auto-approve clips)
node main.js "https://youtu.be/VIDEO_ID" --approve

# Skip subtitle burn-in
node main.js "https://youtu.be/VIDEO_ID" --approve --skip-subtitles

# Skip render + subtitles (just download + cut)
node main.js "https://youtu.be/VIDEO_ID" --approve --skip-render
```

### Individual Scripts

```bash
# Fetch transcript only
uv run python python/transcript.py --url "https://youtu.be/VIDEO_ID"

# Download & cut clips only
node scripts/extract.js "https://youtu.be/VIDEO_ID"

# Face-tracked reframe only (all clips)
python3 scripts/face_reframe.py

# Subtitle burn only (single clip, face-tracked)
CLIP_INDEX=0 python3 scripts/subtitles_oneline.py \
  --burn Outputs/01_clip.mp4 \
  --burn-out Outputs/01_clip_final.mp4 \
  --face-track
```

## 📁 Project Structure

```
autoclipping/
├── main.js                    # Pipeline orchestrator (v3)
├── config.json                # Non-sensitive configuration
├── package.json               # Node.js dependencies
├── pyproject.toml             # Python dependencies (uv)
├── .env.example               # API key template
├── python/
│   └── transcript.py          # YouTube transcript fetcher
├── scripts/
│   ├── setup.sh               # One-time setup (deps + model download)
│   ├── extract.js             # yt-dlp + FFmpeg download & cut
│   ├── render.js              # Calls face_reframe.py (orchestrator)
│   ├── face_reframe.py        # MediaPipe face-tracked 9:16 crop
│   └── subtitles_oneline.py  # v3 subtitle engine (synced + faded)
├── data/                      # Generated (gitignored)
│   ├── transcript.json
│   ├── clips.json
│   └── clips_review.md
├── models/                    # MediaPipe model (gitignored, downloaded)
│   └── face_detector.task
├── assets/                    # Raw cut clips (gitignored)
├── Outputs/                   # Final videos (gitignored)
└── video/                     # Full download (gitignored)
```

## 📝 Subtitle Engine (v3)

`scripts/subtitles_oneline.py` — the subtitle engine produces:

- **One line** per cue (PIL text-width measurement guarantees no wrapping)
- **Small font** (~3.8% of frame height = 49px @1280)
- **Dark backing box** behind each line (BorderStyle=4, semi-transparent)
- **Synced** — weighted per-word interpolation respecting segment boundaries
- **Face-tracked positioning** — subtitle sits below the speaker's face
- **Smooth fade** — 200ms alpha fade-in/out on each cue (configurable via `--fade-ms`)

## 🔧 Configuration

### `config.json`

```json
{
  "clipConfig": {
    "minDuration": 10,
    "maxDuration": 25,
    "idealDuration": 15
  },
  "subtitleConfig": {
    "fontSizeRatio": 0.038,
    "wordsPerCue": 2,
    "fadeMs": 200
  }
}
```

### `.env`

```env
OPENAI_API_KEY=...        # For auto clip selection (optional)
```

## 📦 Dependencies

### Node.js
- `ffmpeg-static` — bundled FFmpeg binary

### Python (uv-managed)
- `youtube-transcript-api` — transcript fetching
- `yt-dlp` — video downloading
- `opencv-python` — frame sampling
- `mediapipe` — BlazeFace face detection
- `Pillow` — text width measurement

## 🔐 Security

- **Never commit `.env`** — it contains API keys
- `.gitignore` excludes all generated content, models, and secrets
- Use `.env.example` as the template

## 📄 License

Part of the YT Clipper content engine. See individual script headers for usage details.
