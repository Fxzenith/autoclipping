# YT Clipper — Integrated Reference

## Purpose
A compact, actionable spec that merges project guidelines, skill design, and pipeline rules for turning YouTube videos into short, high-retention clips.

## Final Stack
- Intelligence: Claude (clip selection, hooks, reasoning)
- Transcript: `youtube-transcript-api` (Python)
- Extraction: `yt-dlp` + FFmpeg
- Rendering: Remotion + Node.js

## Pipeline
1. Input: YouTube URL.
2. Transcript generation: Python fetches timestamped transcript → `data/transcript.json`.
3. AI selection: Claude reads the transcript JSON → produces `data/clips.json` (strict JSON).
4. User verification: Claude MUST also output a human-readable `.md` of timestamps/excerpts for approval.
5. After approval: Node runs `yt-dlp` to download and FFmpeg to cut clips per `clips.json`.
6. Rendering: Remotion renders vertical shorts with captions/motion.

## Project Structure (required)
```
project_root/
├── python/
│   └── transcript.py
├── data/
│   ├── transcript.json
│   └── clips.json
├── video/
│   └── full.mp4
├── assets/
├── Outputs/
├── projects/
├── remotion/
├── scripts/
│   ├── extract.js
│   └── render.js
└── main.js
```

## Inputs & Outputs
- Input: YouTube URL (and optional metadata: title, topic, audience).
- `transcript.json`: timestamped transcript produced by `transcript.py`.
- `clips.json` (machine-readable): strict JSON array of clips, e.g.:

```json
{
  "clips": [
    {"title":"Discipline Truth","start":120,"end":135,"hook":"This is why most people fail","reason":"Strong contrarian hook, concise takeaway"}
  ]
}
```

Notes:
- Final pipeline must consume JSON, not Markdown.
- Separately produce a `.md` summary for the user to approve timestamps before downloading/cutting.

## Clip Constraints & Selection Criteria
- Clip length: 10–25 seconds (ideal ~15s).
- Strong hook within first 1–3 seconds.
- Must be contextually complete (minimal dependence on earlier content).
- Prioritize: strong hooks, emotional peaks, insight density, controversy/tension.
- Avoid: long setup-without-payoff, low-energy segments, segments needing prior context.

For each clip include: `title`, `start`, `end`, `hook`, and a short `reason` explaining why it will perform well.

## Responsibilities
- Python: fetch transcripts and emit `data/transcript.json`.
- Claude (skill): read transcript JSON, select clips, output `data/clips.json` and a `.md` review file.
- Node.js: download (`yt-dlp`), cut (FFmpeg), and run Remotion for final renders.

## Environment & Secrets
- Store secrets in `.env` at project root. Example:

```
ELEVENLABS_API_KEY=your_api_key_here
```
- Non-sensitive config (e.g., Voice ID) may go in `config.json`.

## Rules & Constraints
- Do NOT use Playwright.
- Do NOT perform manual upload/download steps; use `yt-dlp` and programmatic flows.
- Create and use `Outputs/`, `projects/`, and `assets/` directories as designated.
- Mandatory human review: a `.md` file with timestamps/excerpts must be generated and approved before any download/FFmpeg steps.

## Skill Authoring Notes (summarized from SKILL guidance)
- SKILL frontmatter matters: include `name` (kebab-case) and a precise `description` with trigger phrases.
- Progressive disclosure levels:
  1. YAML frontmatter (always loaded)
  2. SKILL.md body (loaded when relevant)
  3. Bundled assets/scripts (loaded when needed)
- `description` should explicitly state when to use the skill and include likely user phrases to trigger it.
- Provide clear, testable steps and examples in the SKILL body; include troubleshooting and a quality checklist.
- Test categories: trigger tests (does the skill load?), functional tests (correct output), and performance/iteration tests.

## Outputs & Downstream Compatibility
- `clips.json` must be strictly valid JSON and compatible with FFmpeg/Remotion ingestion.
- Also output a human-readable `[video]-clips.md` for approval and QA.

## Example `clips.json` entry
```json
{
  "clips": [
    {"title":"Discipline Truth","start":120,"end":135,"hook":"This is why most people fail","reason":"Clear contrarian hook; fits 15s target"}
  ]
}
```

---

If you want, I can:
- validate an existing `transcript.json` or `clips.json` file,
- scaffold `python/transcript.py` or `scripts/extract.js`, or
- produce a Claude prompt that outputs both `clips.json` and the `.md` review file.

Please tell me which next step you prefer.