#!/usr/bin/env node
/**
 * Prepare each approved clip for final delivery.
 * This step now crops the extracted clip to a 9:16 vertical frame and
 * writes it into Outputs/ with a stable, numbered filename that the
 * subtitle pass can reuse.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const ROOT_DIR = path.join(__dirname, '..');
const CLIPS_JSON = path.join(ROOT_DIR, 'data', 'clips.json');
const TRANSCRIPT_JSON = path.join(ROOT_DIR, 'data', 'transcript.json');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const OUTPUTS_DIR = path.join(ROOT_DIR, 'Outputs');
const OUTPUT_WIDTH = 720;
const OUTPUT_HEIGHT = 1280;

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  }
}

function readClips() {
  if (!fs.existsSync(CLIPS_JSON)) {
    throw new Error(`Missing clips.json at ${CLIPS_JSON}`);
  }

  const data = JSON.parse(fs.readFileSync(CLIPS_JSON, 'utf8'));
  return Array.isArray(data.clips) ? data.clips : [];
}

function readTranscript() {
  if (!fs.existsSync(TRANSCRIPT_JSON)) {
    console.warn(`Missing transcript.json at ${TRANSCRIPT_JSON}`);
    return [];
  }

  const data = JSON.parse(fs.readFileSync(TRANSCRIPT_JSON, 'utf8'));
  return Array.isArray(data.transcript) ? data.transcript : [];
}

function slugify(value, index = 0) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const slug = base.slice(0, 60);
  return index > 0 ? `${slug}_${index}` : slug;
}

function clearPreviousOutput(clipNumber) {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    return;
  }

  const prefix = `${clipNumber}_`;
  for (const file of fs.readdirSync(OUTPUTS_DIR)) {
    if (file.startsWith(prefix) && file.endsWith('.mp4')) {
      fs.rmSync(path.join(OUTPUTS_DIR, file), { force: true });
    }
  }
}

function ffmpegCommand() {
  return ffmpegStatic || 'ffmpeg';
}

function cropToVertical(inputFile, outputFile) {
  const args = [
    '-y',
    '-i',
    inputFile,
    '-vf',
    `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'(iw-out_w)/2':'(ih-out_h)/2',scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '20',
    '-c:a',
    'copy',
    outputFile,
  ];

  const result = spawnSync(ffmpegCommand(), args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`ffmpeg crop failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`ffmpeg crop exited with code ${result.status}`);
  }
}

function renderClip(clip, index, transcript, usedTitles = {}) {
  const clipNumber = String(index).padStart(2, '0');
  const assetFile = path.join(ASSETS_DIR, `clip_${clipNumber}.mp4`);

  if (!fs.existsSync(assetFile)) {
    console.warn(`Skipping clip ${clipNumber}: missing asset ${assetFile}`);
    return false;
  }

  const clipStart = Number(clip.start);
  const clipEnd = Number(clip.end);
  const slicedTranscript = transcript
    .filter((t) => t.end >= clipStart && t.start <= clipEnd)
    .map((t) => ({
      ...t,
      start: t.start - clipStart,
      end: t.end - clipStart,
    }));

  const clipTitle = clip.title || `Clip ${clipNumber}`;
  const slugIndex = usedTitles[clipTitle] || 0;
  usedTitles[clipTitle] = slugIndex + 1;

  const safeTitle = slugify(clipTitle, slugIndex) || `clip_${clipNumber}`;
  const outputFile = path.join(OUTPUTS_DIR, `${clipNumber}_${safeTitle}.mp4`);

  console.log(`Rendering ${clipTitle} -> ${outputFile}`);
  clearPreviousOutput(clipNumber);

  try {
    cropToVertical(assetFile, outputFile);
    console.log(`Cropped to vertical 9:16 at ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`);
    return true;
  } catch (err) {
    console.warn(`Failed to render clip ${clipNumber}: ${err.message}`);
    return false;
  }
}

function main() {
  console.log('============================================================');
  console.log('Clip Renderer');
  console.log('============================================================\n');

  const clips = readClips();
  const transcript = readTranscript();

  if (clips.length === 0) {
    console.warn('No clips found in data/clips.json');
    return;
  }

  ensureOutputDir();

  const usedTitles = {};
  let renderedCount = 0;

  clips.forEach((clip, index) => {
    if (renderClip(clip, index + 1, transcript, usedTitles)) {
      renderedCount += 1;
    }
  });

  console.log(`\nPrepared ${renderedCount} of ${clips.length} clips in ${OUTPUTS_DIR}`);
}

try {
  main();
} catch (err) {
  console.error('Error:', err.message || err);
  process.exit(1);
}
