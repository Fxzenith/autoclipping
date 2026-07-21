#!/usr/bin/env python3
"""
Face-tracker reframe for 9:16 Shorts.

Replaces render.js's dumb center-crop with a face-aware crop:
  1. Sample frames from each assets/clip_XX.mp4 with MediaPipe FaceDetection.
  2. Find the median face box across the clip (speaker is mostly static in
     talking-head clips, so a single crop offset per clip is stable and smooth).
  3. Compute a 9:16 crop window that keeps the face in the upper-center third,
     leaving the lower third free for the burned subtitle.
  4. Run ffmpeg crop+scale to Outputs/ at 720x1280.

If no face is detected in a clip, falls back to center crop (safe).

Usage:
  python3 scripts/face_reframe.py            # process all clips in data/clips.json
  python3 scripts/face_reframe.py --clip 1  # only clip index 1 (0-based)
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import cv2
import mediapipe as mp

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUTPUTS = ROOT / "Outputs"
CLIPS_JSON = ROOT / "data" / "clips.json"
OUT_W, OUT_H = 720, 1280  # 9:16


def slugify(v):
    import re
    s = re.sub(r"[^a-z0-9]+", "_", str(v or "").lower()).strip("_")[:60]
    return s


def detect_face_center_mediapipe(video_path, sample_hz=2.0):
    """Return (cx, cy, face_h_ratio) in normalized [0..1] coords, or None.
    Uses the MediaPipe Tasks FaceDetector API (mediapipe 0.10.x)."""
    import mediapipe as mp
    from mediapipe.tasks.python import vision
    from mediapipe.tasks.python.core.base_options import BaseOptions

    MODEL = Path(__file__).resolve().parent.parent / "models" / "face_detector.task"
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    sample_every = max(1, int(fps / sample_hz))
    opt = vision.FaceDetectorOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL)),
        min_detection_confidence=0.4)
    det = vision.FaceDetector.create_from_options(opt)
    xs, ys, hs = [], [], []
    frame_i = 0
    iw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
    ih = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_i % sample_every == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            res = det.detect(img)
            if res.detections:
                bb = res.detections[0].bounding_box
                # normalize to [0..1]
                cx = (bb.origin_x + bb.width / 2) / iw
                cy = (bb.origin_y + bb.height / 2) / ih
                fh = bb.height / ih
                xs.append(cx); ys.append(cy); hs.append(fh)
        frame_i += 1
    cap.release(); det.close()
    if not xs:
        return None
    xs.sort(); ys.sort(); hs.sort()
    return (xs[len(xs)//2], ys[len(ys)//2], hs[len(hs)//2])


def compute_crop(video_path, out_w=OUT_W, out_h=OUT_H):
    """Return ffmpeg crop args (w,h,x,y) in SOURCE pixel coords."""
    cap = cv2.VideoCapture(str(video_path))
    iw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    ih = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()
    if not iw or not ih:
        return None
    # 9:16 crop size in source pixels
    crop_w = min(iw, int(ih * 9 / 16))
    crop_h = min(ih, int(crop_w * 16 / 9))
    face = detect_face_center_mediapipe(video_path)
    # target: face center at ~30% of the OUTPUT height (upper third), so the
    # subtitle band (lower ~12%) sits BELOW the face, not over it.
    if face:
        nfx, nfy, nfh = face
        # map face center to source px
        fcy_px = nfy * ih
        # we want face center placed at 30% of output height.
        # output_y_target_px_in_source = top_of_crop + 0.30 * crop_h
        # => top_of_crop = fcy_px - 0.30 * crop_h
        # but also keep face within frame: don't crop above 0 or below ih-crop_h
        target_top = int(fcy_px - 0.30 * crop_h)
        max_top = ih - crop_h
        y = max(0, min(max_top, target_top))
    else:
        y = max(0, (ih - crop_h) // 2)  # center crop fallback
    x = max(0, (iw - crop_w) // 2)
    return (crop_w, crop_h, x, y, iw, ih, face is not None)


def ffmpeg_crop_scale(input_path, output_path, crop, crf=20):
    w, h, x, y, iw, ih, tracked = crop
    vf = f"crop={w}:{h}:{x}:{y},scale={OUT_W}:{OUT_H}"
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(input_path),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", str(crf),
        "-c:a", "copy",
        str(output_path),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[face_reframe] ffmpeg failed: {r.stderr}", file=sys.stderr)
        return False
    tag = "face-tracked" if tracked else "center-crop (no face)"
    print(f"  crop {w}x{h} @({x},{y}) from {iw}x{ih} -> {OUT_W}x{OUT_H} [{tag}]")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", type=int, default=-1, help="0-based clip index; -1 = all")
    ap.add_argument("--crf", type=int, default=20)
    a = ap.parse_args()

    clips = json.load(open(CLIPS_JSON))["clips"]
    OUTPUTS.mkdir(parents=True, exist_ok=True)
    indices = [a.clip] if a.clip >= 0 else range(len(clips))
    for i in indices:
        if i >= len(clips):
            continue
        c = clips[i]
        num = f"{i+1:02d}"
        asset = ASSETS / f"clip_{num}.mp4"
        if not asset.exists():
            print(f"[face_reframe] MISSING {asset.name} - skip")
            continue
        slug = slugify(c.get("title", f"clip_{num}"))
        out = OUTPUTS / f"{num}_{slug}.mp4"
        # clear old outputs for this clip
        for old in OUTPUTS.glob(f"{num}_*.mp4"):
            old.unlink()
        print(f"[face_reframe] clip {num}: {c.get('title','')} ({asset.name})")
        crop = compute_crop(asset)
        if not crop:
            print(f"  could not read {asset}")
            continue
        ok = ffmpeg_crop_scale(asset, out, crop, crf=a.crf)
        print(f"  -> {out.name} {'OK' if ok else 'FAIL'}")


if __name__ == "__main__":
    main()
