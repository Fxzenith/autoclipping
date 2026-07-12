#!/usr/bin/env node
// Download the source video and cut each approved clip into assets/.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const ROOT_DIR = path.join(__dirname, '..');
const CLIPS_PATH = path.join(ROOT_DIR, 'data', 'clips.json');
const VIDEO_DIR = path.join(ROOT_DIR, 'video');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

function ensureDirs() {
  [VIDEO_DIR, ASSETS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function cleanupGeneratedFiles() {
  if (fs.existsSync(VIDEO_DIR)) {
    for (const file of fs.readdirSync(VIDEO_DIR)) {
      if (/^full\./i.test(file)) {
        fs.rmSync(path.join(VIDEO_DIR, file), { force: true });
      }
    }
  }

  if (fs.existsSync(ASSETS_DIR)) {
    for (const file of fs.readdirSync(ASSETS_DIR)) {
      if (/^clip_\d{2}\.mp4$/i.test(file)) {
        fs.rmSync(path.join(ASSETS_DIR, file), { force: true });
      }
    }
  }
}

function readClips() {
  if (!fs.existsSync(CLIPS_PATH)) {
    throw new Error(`Missing clips.json at ${CLIPS_PATH}`);
  }

  const data = JSON.parse(fs.readFileSync(CLIPS_PATH, 'utf8'));
  const clips = Array.isArray(data.clips) ? data.clips : [];

  const invalidClips = clips.filter((clip) => !clip.title || !clip.hook || typeof clip.start !== 'number' || typeof clip.end !== 'number');
  if (invalidClips.length > 0) {
    throw new Error(`Invalid clips.json: ${invalidClips.length} clip(s) missing required fields (title, hook, start, end)`);
  }

  return clips
    .map((clip) => ({
      ...clip,
      start: Number(clip.start),
      end: Number(clip.end),
    }))
    .filter((clip) => Number.isFinite(clip.start) && Number.isFinite(clip.end) && clip.end > clip.start);
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${result.status}`);
  }
}

function downloadVideo(url, outFile, maxRetries = 3) {
  console.log(`Downloading video to ${outFile}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Download attempt ${attempt}/${maxRetries}...`);

    const ytDlpArgs = [
      '-f',
      'bestvideo+bestaudio/best',
      '--merge-output-format',
      'mp4',
      '-o',
      outFile,
      url,
    ];

    let result = spawnSync('yt-dlp', ytDlpArgs, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });

    if (result.status === 0 && fs.existsSync(outFile)) {
      return;
    }

    console.log('Primary download failed, trying Python module fallback...');
    result = spawnSync('python', ['-m', 'yt_dlp', '-f', 'best', '--merge-output-format', 'mp4', '-o', outFile, url], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });

    if (result.status === 0 && fs.existsSync(outFile)) {
      return;
    }

    console.log('Python fallback failed, trying npx fallback...');
    result = spawnSync('npx', ['--yes', 'yt-dlp', ...ytDlpArgs], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });

    if (result.status === 0 && fs.existsSync(outFile)) {
      return;
    }

    const fallback = path.join(path.dirname(outFile), 'full.f399.mp4');
    if (fs.existsSync(fallback)) {
      console.log(`Using fallback: ${fallback}`);
      return;
    }

    if (attempt < maxRetries) {
      console.log(`Download failed, retrying in 3 seconds...`);
      const { spawnSync: sync } = require('child_process');
      sync('ping', ['-n', '3', '127.0.0.1'], { stdio: 'ignore' });
    }
  }

  throw new Error(`Download failed after ${maxRetries} attempts`);
}

function ffmpegCommand() {
  return ffmpegPath || 'ffmpeg';
}

function safeDuration(clip, index) {
  const duration = clip.end - clip.start;
  if (duration <= 0) {
    throw new Error(`Clip ${index} has a non-positive duration`);
  }
  return duration;
}

function cutClip(fullPath, clip, index) {
  const clipNumber = String(index).padStart(2, '0');
  const outName = `clip_${clipNumber}.mp4`;
  const outPath = path.join(ASSETS_DIR, outName);
  const duration = safeDuration(clip, index);

  const args = [
    '-y',
    '-ss',
    String(clip.start),
    '-i',
    fullPath,
    '-t',
    String(duration),
    '-vf',
    'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outPath,
  ];

  console.log(`Cutting ${outName} (${clip.start} -> ${clip.end})`);
  runCommand(ffmpegCommand(), args, `ffmpeg clip ${clipNumber}`);
}

function findActualVideo() {
  const dir = VIDEO_DIR;
  const files = fs.readdirSync(dir);
  const videos = files.filter(f => f.startsWith('full.')).sort().reverse();
  for (const f of videos) {
    const ext = path.extname(f).toLowerCase();
    if (['.mp4', '.webm', '.mkv', '.m4a'].includes(ext)) {
      return path.join(dir, f);
    }
  }
  throw new Error('No video file found');
}

function main() {
  const videoUrl = process.argv[2];
  if (!videoUrl) {
    console.error('Usage: node scripts/extract.js <youtube_url>');
    process.exit(2);
  }

  const clips = readClips();
  if (clips.length === 0) {
    throw new Error('No valid clips found in data/clips.json');
  }

  ensureDirs();
  cleanupGeneratedFiles();

  const fullVideoPath = path.join(VIDEO_DIR, 'full.mp4');
  downloadVideo(videoUrl, fullVideoPath);

  const actualVideo = findActualVideo();
  console.log(`Using video: ${actualVideo}`);

  clips.forEach((clip, index) => {
    cutClip(actualVideo, clip, index + 1);
  });

  console.log(`All clips exported to ${ASSETS_DIR}`);
}

try {
  main();
} catch (err) {
  console.error('Error:', err.message || err);
  process.exit(1);
}
