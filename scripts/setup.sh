#!/usr/bin/env bash
# ============================================================
# YT Clipper — Setup Script
# ============================================================
# Run once after cloning the repo.
# Installs Node + Python deps and downloads the face detection model.
#
# Usage:
#   bash scripts/setup.sh
# ============================================================

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "============================================================"
echo "  YT Clipper — Setup"
echo "============================================================"

# --- Node.js dependencies ---
echo ""
echo "[1/3] Installing Node.js dependencies..."
npm install

# --- Python dependencies (uv-managed) ---
echo ""
echo "[2/3] Installing Python dependencies (uv)..."
if ! command -v uv &>/dev/null; then
  echo "  uv not found — installing..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
uv sync

# --- MediaPipe face detection model ---
echo ""
echo "[3/3] Downloading MediaPipe face detection model..."
mkdir -p models
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
MODEL_PATH="models/face_detector.task"

if [ -f "$MODEL_PATH" ]; then
  echo "  Model already exists: $MODEL_PATH"
else
  curl -sL -o "$MODEL_PATH" "$MODEL_URL"
  echo "  Downloaded: $MODEL_PATH"
fi

echo ""
echo "============================================================"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Copy .env.example to .env and fill in API keys"
echo "    2. Run: node main.js \"<youtube_url>\" --approve"
echo "============================================================"
