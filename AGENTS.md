# YT Clipper — v3 Pipeline (Face-Tracked Shorts)

## 🎯 Stack
- **Intelligence**: Claude (clip selection, hooks, reasoning)
- **Transcript**: `youtube-transcript-api` (Python, uv-managed)
- **Extraction**: `yt-dlp` + FFmpeg (download + cut at 720p)
- **Reframe**: `scripts/face_reframe.py` (MediaPipe BlazeFace → 9:16 face-tracked crop)
- **Subtitles**: `scripts/subtitles_oneline.py` (v3: synced + face-tracked + faded, one-line)
- **Orchestration**: `main.js` (Node.js)

## 📁 Structure
```
project_root/
├── main.js               # Orchestrator (v3 pipeline)
├── config.json           # Non-sensitive config
├── package.json         # Node deps
├── pyproject.toml       # Python deps (uv)
├── .env.example          # API key template
├── python/
│   └── transcript.py    # Fetch transcript
├── scripts/
│   ├── setup.sh          # One-time setup (deps + model download)
│   ├── extract.js         # Download + cut clips (yt-dlp)
│   ├── render.js          # Orchestrator → face_reframe.py
│   ├── face_reframe.py    # MediaPipe face-tracked 9:16 crop
│   └── subtitles_oneline.py  # v3 subtitle engine
├── data/                 # Generated (gitignored)
│   ├── transcript.json
│   ├── clips.json
│   └── clips_review.md
├── models/               # MediaPipe model (gitignored)
├── assets/               # Cut clips (gitignored)
├── Outputs/              # Final videos (gitignored)
└── video/                # Full download (gitignored)
```

## 🔗 Pipeline
```
1. uv run python python/transcript.py --url "<URL>"
2. Claude creates data/clips.json + data/clips_review.md
3. User approves (or --approve flag)
4. node scripts/extract.js "<URL>"          → assets/clip_XX.mp4
5. python3 scripts/face_reframe.py          → Outputs/NN_slug.mp4 (9:16, face-tracked)
6. python3 scripts/subtitles_oneline.py     → Outputs/NN_slug.mp4 (subtitled)
     --burn Outputs/NN_slug.mp4
     --burn-out Outputs/NN_slug_final.mp4
     --face-track
```

**Full pipeline:** `node main.js "<URL>" --approve`

## 📋 JSON Schemas
- `transcript.json`: `{video_id, source_url, transcript: [{start, end, text}]}`
- `clips.json`: `{clips: [{start, end, title, hook, reason}]}`
- ALL clips MUST have: `start`, `end`, `title`, `hook` (hook = first 3s quote)

## 🔑 Env Vars (`.env`)
- `OPENAI_API_KEY` — optional, for auto clip selection
- `ELEVENLABS_API_KEY` — optional, for AI voiceovers

## ⚠️ Pitfalls
1. **Folder is `video/`** NOT `videos/`
2. **Review file is `data/clips_review.md`** NOT `review.md`
3. **Every clip MUST have title + hook** — render fails silently otherwise
4. **Run `bash scripts/setup.sh`** before first use — downloads the face detection model
5. **yt-dlp needs a JS runtime** — set `--js-runtimes node` in `~/.config/yt-dlp/config`
6. **UV-managed Python** — use `uv sync` to install deps, `uv run python` to run scripts
7. **Model file is gitignored** — `models/face_detector.task` is downloaded by `scripts/setup.sh`

## ✅ Verification Checklist (New Session)
- [ ] `bash scripts/setup.sh` has been run
- [ ] `models/face_detector.task` exists
- [ ] `data/clips.json` has all required fields (start, end, title, hook)
- [ ] `data/clips_review.md` exists
- [ ] `assets/clip_XX.mp4` exists before render
- [ ] Use `--approve` for auto-approval