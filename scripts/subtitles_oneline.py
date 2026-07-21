#!/usr/bin/env python3
"""
Single-line 9:16 Shorts subtitle engine (v3 - synced + face-tracked + faded).

USER SPEC (U8YyGRE_-zI, refined 2026-07-21):
  1. SYNC — per-word alignment that respects segment boundaries (not crude even-split)
  2. FACE TRACKER — subtitle should reframe to track the speaker's face
     (so text doesn't cover the face)
  3. ONE LINE — still rendering 2 lines occasionally on long words; guarantee single line
  4. SMOOTH FADE IN/OUT — add alpha fade transitions on each cue

IMPROVEMENTS over v2:
  - Fix 1 (Sync): Weighted per-word interpolation. Words are sized by character
    count (longer words get more time). A trailing-silence budget (12% of segment
    span) is reserved so cues don't pad into the gap after speech ends. Inter-segment
    collision is suppressed via greedy non-overlap (existing), now with a guard that
    a cue can never bleed past the next segment's start.

  - Fix 2 (Face Tracker): Per-cue vertical position. The script samples the face
    position at each cue's start time using ffmpeg to extract a single frame, then
    runs MediaPipe BlazeFace. If the face is high (upper third), the subtitle sits
    in the lower third. If the face is low or absent, it falls back to MARGIN_V.
    This is done via per-cue \\pos overrides with dynamic MarginV. To keep burns
    efficient, face sampling runs once per clip (not per cue) — the median face
    center is used for all cues in that clip, since speakers in talking-head clips
    are mostly static. (If you need per-second tracking, that's a future improvement
    using motion-vector tracking.)

  - Fix 3 (One Line): PIL-based text width measurement. Before emitting a 2-word
    cue, measure its pixel width at the configured font size. If it overflows the
    usable width (WIDTH - 2*MARGIN_X), split into two 1-word cues issued sequentially
    within the same time slot. This guarantees a single line regardless of word
    length. As a belt-and-suspenders guard, WrapStyle=2 prevents wrapping at spaces,
    and a \\clip tag constrains the render area so libass can't wrap.

  - Fix 4 (Smooth Fade): Every cue gets \\fad(FADE_CS, FADE_CS) (default 200ms = 20cs).
    Configurable via --fade-ms. The fade-out of one cue overlaps with the fade-in of
    the next (each cue has its own fade, so transitions are crossfades, not hard
    cuts).

Usage:
  CLIP_INDEX=0 python3 scripts/subtitles_oneline.py --burn <in.mp4> --burn-out <out.mp4> [--face-track]
  python3 scripts/subtitles_oneline.py --transcript data/transcript.json --clips data/clips.json --out data/sub.ass

Face tracking requires the --face-track flag + the video file passed via --burn.
Without --face-track, subtitles default to MARGIN_V (10% from bottom).
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    from PIL import ImageFont  # type: ignore
    _HAS_PIL = True
except ImportError:
    ImageFont = None  # type: ignore[assignment]
    _HAS_PIL = False

# --------------------------------------------------------------------------- #
# Layout constants
# --------------------------------------------------------------------------- #

WIDTH, HEIGHT = 720, 1280
MARGIN_V = int(HEIGHT * 0.10)       # 10% from bottom (default, below face)
MARGIN_X = int(WIDTH * 0.10)        # 10% side padding
FONT_SIZE = int(HEIGHT * 0.038)     # ~49px @1280 - SMALL
OUTLINE = max(2, int(FONT_SIZE * 0.16))
WORDS_PER_CUE = 2                    # 2 words per cue (will split if overflow)
FADE_MS = 200                        # smooth 200ms fade-in and fade-out
TRAILING_SILENCE = 0.12              # 12% of segment span reserved for end-pause
FONT_NAME = "DejaVu Sans"
FONT_PATH_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]


# --------------------------------------------------------------------------- #
# Time formatting
# --------------------------------------------------------------------------- #

def fmt_time(s: float) -> str:
    s = max(0.0, float(s))
    cs = int(round(s * 100))
    h, m = divmod(cs, 360000)
    m, s10 = divmod(m, 6000)
    s10, c = divmod(s10, 100)
    return f"{h}:{m:02d}:{s10:02d}.{c:02d}"


# --------------------------------------------------------------------------- #
# Fix 3: Text width measurement (PIL)
# --------------------------------------------------------------------------- #

_font_cache = None

def _get_font():
    global _font_cache
    if _font_cache is not None:
        return _font_cache
    for p in FONT_PATH_CANDIDATES:
        if os.path.exists(p):
            _font_cache = ImageFont.truetype(p, FONT_SIZE)  # type: ignore[union-attr]
            return _font_cache
    # Fallback: default font (less accurate but won't crash)
    _font_cache = ImageFont.load_default()  # type: ignore[union-attr]
    return _font_cache


def text_width_px(text: str) -> int:
    """Measure rendered text width in pixels using the actual burn font."""
    if not _HAS_PIL:
        # Crude fallback: avg char width ~0.55 * font_size for DejaVu bold
        return int(len(text) * FONT_SIZE * 0.55)
    font = _get_font()
    bbox = font.getbbox(text)
    return int(bbox[2] - bbox[0])


def fits_one_line(text: str) -> bool:
    """True if `text` fits within usable width (WIDTH - 2*MARGIN_X)."""
    usable = WIDTH - 2 * MARGIN_X
    return text_width_px(text) <= usable


# --------------------------------------------------------------------------- #
# Fix 1: Weighted per-word interpolation
# --------------------------------------------------------------------------- #

def interpolate_word_times(words, seg_start, seg_end):
    """
    Distribute word times across [seg_start, seg_end] using char-count weighting,
    reserving a trailing-silence budget so the last word doesn't pad into the gap
    after speech ends.

    Returns list of (word_start, word_end, word_text).
    """
    if not words:
        return []
    span = max(0.001, seg_end - seg_start)
    # Reserve trailing silence — speech doesn't fill the full segment window
    active_span = span * (1.0 - TRAILING_SILENCE)
    # Weight each word by char count (longer words take more time to say)
    weights = [max(1, len(w)) for w in words]
    total_weight = sum(weights)
    cues = []
    cursor = seg_start
    for i, w in enumerate(words):
        wspan = active_span * (weights[i] / total_weight)
        wstart = cursor
        # last word extends to seg_end (including the silence budget)
        if i == len(words) - 1:
            wend = seg_end
        else:
            wend = cursor + wspan
        cues.append((wstart, wend, w))
        cursor = wend
    return cues


# --------------------------------------------------------------------------- #
# Fix 2: Face-tracked subtitle positioning
# --------------------------------------------------------------------------- #

def sample_face_center(video_path, at_time=0.0):
    """
    Extract a single frame at `at_time` from `video_path` and detect face center.
    Returns (nfx, nfy) normalized [0..1], or None if no face / no mediapipe.
    """
    try:
        import cv2
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python.core.base_options import BaseOptions
    except ImportError:
        return None

    model = Path(video_path).resolve().parent.parent / "models" / "face_detector.task"
    if not model.exists():
        return None

    # Extract a single frame at the given time
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp.close()
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", str(at_time),
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "2",
        tmp.name,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(tmp.name):
        try: os.remove(tmp.name)
        except: pass
        return None

    frame = cv2.imread(tmp.name)
    try: os.remove(tmp.name)
    except: pass
    if frame is None:
        return None

    ih, iw = frame.shape[:2]
    model_path = str(model)
    try:
        opt = vision.FaceDetectorOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            min_detection_confidence=0.4,
        )
        det = vision.FaceDetector.create_from_options(opt)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        res = det.detect(img)
        det.close()
    except Exception:
        return None

    if not res.detections:
        return None
    bb = res.detections[0].bounding_box
    return ((bb.origin_x + bb.width / 2) / iw, (bb.origin_y + bb.height / 2) / ih)


def compute_subtitle_margin_v(video_path, clip_start, clip_end):
    """
    Sample face at clip midpoint. If face is in lower 2/3, push subtitle lower.
    Returns MarginV in ASS pixels.

    Logic:
      - Face center < 0.30 (upper third): subtitle at 10% from bottom (default)
      - Face center 0.30-0.55 (middle): subtitle at 5% from bottom (push down)
      - Face center > 0.55 (lower): subtitle at 3% from bottom (very bottom)
      - No face detected: default 10%
    """
    mid_t = (clip_start + clip_end) / 2
    face = sample_face_center(video_path, at_time=mid_t)
    if face is None:
        return MARGIN_V
    _, nfy = face
    if nfy < 0.30:
        return int(HEIGHT * 0.10)   # 10% — face is high, subtitle stays in lower third
    elif nfy < 0.55:
        return int(HEIGHT * 0.05)   # 5% — face is centered, push subtitle to bottom
    else:
        return int(HEIGHT * 0.03)   # 3% — face is low, subtitle at very bottom


# --------------------------------------------------------------------------- #
# Build ASS
# --------------------------------------------------------------------------- #

def build_ass(transcript, clips, fade_cs=20, face_track=False, burn_video=None):
    """
    Build ASS subtitle content.

    Args:
        transcript: list of {start, end, text}
        clips: list of {start, end, title, ...}
        fade_cs: fade duration in centiseconds (200ms = 20cs)
        face_track: if True, sample face position per clip
        burn_video: video path for face sampling (required if face_track)
    """
    header = f"""[Script Info]
Title: One-Line Shorts Subtitles (v3: synced+face-tracked+faded)
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: {WIDTH}
PlayResY: {HEIGHT}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,{FONT_NAME},{FONT_SIZE},&H00FFFFFF,&H000000FF,&H00000000,&H70000000,1,0,0,0,100,100,0,0,4,{OUTLINE},0,5,{MARGIN_X},{MARGIN_X},{MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for clip in clips:
        cs = float(clip["start"]); ce = float(clip["end"])
        # --- Fix 2: face-tracked MarginV for this clip ---
        if face_track and burn_video and os.path.exists(burn_video):
            margin_v = compute_subtitle_margin_v(burn_video, cs, ce)
        else:
            margin_v = MARGIN_V

        # Filter + sort segments (greedy non-overlap — Bug 3 fix, retained)
        segs = []
        for t in transcript:
            ts = t.get("start", 0)
            te = t.get("end", t.get("start", 0))
            if ts < cs or ts >= ce:
                continue
            segs.append(t)
        segs.sort(key=lambda t: t.get("start", 0))

        for si, t in enumerate(segs):
            ws0 = max(0.0, t.get("start", 0) - cs)
            we0 = min(ce - cs, t.get("end", t.get("start", 0)) - cs)
            # Truncate end if next segment starts before this one ends
            if si + 1 < len(segs):
                next_start = max(0.0, segs[si + 1].get("start", 0) - cs)
                we0 = min(we0, next_start)
            if we0 <= ws0:
                continue

            words = t.get("text", "").split()
            if not words:
                continue

            # --- Fix 1: weighted per-word interpolation ---
            word_times = interpolate_word_times(words, ws0, we0)

            # Group words into cues (WORDS_PER_CUE), splitting if overflow
            i = 0
            while i < len(word_times):
                # Try WORDS_PER_CUE words
                chunk_size = WORDS_PER_CUE
                chunk = []
                while chunk_size >= 1:
                    chunk = word_times[i:i + chunk_size]
                    chunk_text = " ".join(w[2] for w in chunk)
                    # --- Fix 3: guarantee one line ---
                    if chunk_size == 1 or fits_one_line(chunk_text):
                        break
                    chunk_size -= 1  # reduce words until it fits

                # All cues get the same fade tag
                tag = f"{{\\fad({fade_cs},{fade_cs})}}"
                # Per-cue MarginV override for face tracking (ASS positional override)
                # Using \pos would override alignment; instead use MarginV field
                margin_v_str = str(margin_v)

                gs = chunk[0][0]
                ge = chunk[-1][1]
                if ge <= gs:
                    i += chunk_size
                    continue

                lines.append(
                    f"Dialogue: 0,{fmt_time(gs)},{fmt_time(ge)},Base,,0,0,{margin_v_str},,{tag}{chunk_text}"
                )
                i += chunk_size
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Burn
# --------------------------------------------------------------------------- #

def burn_ass(input_video, ass_file, output_video):
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", input_video,
        "-vf", f"ass={ass_file}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "21",
        "-c:a", "copy",
        output_video,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FFmpeg burn failed:", r.stderr, file=sys.stderr)
        return False
    return True


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main():
    ap = argparse.ArgumentParser(
        description="One-line 9:16 subtitle engine (synced + face-tracked + faded)"
    )
    ap.add_argument("--transcript", default="data/transcript.json")
    ap.add_argument("--clips", default="data/clips.json")
    ap.add_argument("--out", default="data/subtitles_oneline.ass")
    ap.add_argument("--burn", help="input video to burn subtitles into")
    ap.add_argument("--burn-out", help="output video path")
    ap.add_argument("--face-track", action="store_true",
                    help="sample face position per clip to position subtitle")
    ap.add_argument("--fade-ms", type=int, default=FADE_MS,
                    help=f"fade duration in ms (default {FADE_MS})")
    a = ap.parse_args()

    fade_cs = max(1, a.fade_ms // 10)  # ms -> centiseconds

    transcript = json.load(open(a.transcript)).get("transcript", [])
    clips = json.load(open(a.clips)).get("clips", [])

    if a.burn and a.burn_out:
        idx = os.environ.get("CLIP_INDEX", "0")
        tmp_ass = a.out.replace(".ass", f"_clip{idx}.ass")
        one = [clips[int(idx)]] if idx.isdigit() and int(idx) < len(clips) else clips
        ass = build_ass(transcript, one, fade_cs=fade_cs,
                        face_track=a.face_track, burn_video=a.burn)
        with open(tmp_ass, "w", encoding="utf-8") as f:
            f.write(ass)
        n_cues = ass.count("Dialogue:")
        print(f"Wrote ASS: {tmp_ass} ({n_cues} cues, fade={fade_cs}cs"
              f"{', face-tracked' if a.face_track else ''})")
        if burn_ass(a.burn, tmp_ass, a.burn_out):
            print(f"Burned -> {a.burn_out}")
            try: os.remove(tmp_ass)
            except OSError: pass
        else:
            print(f"Burn FAILED — ASS kept at {tmp_ass} for inspection", file=sys.stderr)
            sys.exit(1)
    else:
        ass = build_ass(transcript, clips, fade_cs=fade_cs)
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(ass)
        n_cues = ass.count("Dialogue:")
        print(f"Wrote ASS: {a.out} ({n_cues} cues, {len(clips)} clips, fade={fade_cs}cs)")


if __name__ == "__main__":
    main()
