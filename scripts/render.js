#!/usr/bin/env node
/**
 * Render step — face-tracked vertical reframe via face_reframe.py.
 *
 * Replaces the old dumb center-crop. For each clip in data/clips.json, this
 * calls `python3 scripts/face_reframe.py --clip N` which:
 *   1. Samples the clip with MediaPipe BlazeFace to find the speaker's face.
 *   2. Crops to 9:16 (720x1280) keeping the face in the upper third.
 *   3. Falls back to center-crop if no face is detected.
 *
 * Output: Outputs/NN_slug.mp4 (vertical, unsubtitled — subtitles burned in next step)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const CLIPS_JSON = path.join(ROOT_DIR, 'data', 'clips.json');
const fs = require('fs');

function readClips() {
  if (!fs.existsSync(CLIPS_JSON)) {
    throw new Error(`Missing clips.json at ${CLIPS_JSON}`);
  }
  const data = JSON.parse(fs.readFileSync(CLIPS_JSON, 'utf8'));
  return Array.isArray(data.clips) ? data.clips : [];
}

function main() {
  console.log('============================================================');
  console.log('Face-Tracked Vertical Reframe');
  console.log('============================================================\n');

  const clips = readClips();

  if (clips.length === 0) {
    console.warn('No clips found in data/clips.json');
    return;
  }

  console.log(`Processing ${clips.length} clip(s)...\n`);

  // Process ALL clips in one call to face_reframe.py (more efficient —
  // the Python script handles the loop internally).
  const result = spawnSync('python3', ['scripts/face_reframe.py'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`face_reframe.py failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`face_reframe.py exited with code ${result.status}`);
  }

  console.log(`\nFace-tracked reframe complete. Output: Outputs/`);
}

try {
  main();
} catch (err) {
  console.error('Error:', err.message || err);
  process.exit(1);
}
