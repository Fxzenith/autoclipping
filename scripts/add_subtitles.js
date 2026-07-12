#!/usr/bin/env node
/**
 * Burn timed subtitles into each rendered clip using FFmpeg.
 *
 * This script looks up rendered files by clip number, so it stays aligned
 * with the renderer even if the title slug changes.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const ROOT_DIR = path.join(__dirname, '..');
const OUTPUTS_DIR = path.join(ROOT_DIR, 'Outputs');
const TRANSCRIPT_JSON = path.join(ROOT_DIR, 'data', 'transcript.json');
const CLIPS_JSON = path.join(ROOT_DIR, 'data', 'clips.json');

function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  const ms = Math.floor((safeSeconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
    .toString()
    .padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function slugify(value, index = 0) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const slug = base.slice(0, 60);
  return index > 0 ? `${slug}_${index}` : slug;
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label} at ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readClips() {
  const data = readJson(CLIPS_JSON, 'clips.json');
  return Array.isArray(data.clips) ? data.clips : [];
}

function readTranscript() {
  const data = readJson(TRANSCRIPT_JSON, 'transcript.json');
  return Array.isArray(data.transcript) ? data.transcript : [];
}

function findRenderedClipFile(clipNumber, title) {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    return null;
  }

  const prefix = `${clipNumber}_`;
  const files = fs
    .readdirSync(OUTPUTS_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith('.mp4'));

  if (files.length === 0) {
    return null;
  }

  const exactSlug = `${prefix}${slugify(title)}.mp4`;
  if (files.includes(exactSlug)) {
    return path.join(OUTPUTS_DIR, exactSlug);
  }

  files.sort();
  return path.join(OUTPUTS_DIR, files[0]);
}

function buildSrtContent(transcript, clipStart, clipEnd) {
  const clipDuration = Math.max(0, clipEnd - clipStart);
  const clipTranscripts = transcript.filter((t) => t.end >= clipStart && t.start <= clipEnd);

  const srtLines = [];
  let index = 1;

  for (const t of clipTranscripts) {
    const start = Math.max(0, Math.min(clipDuration, Number(t.start) - clipStart));
    const end = Math.max(0, Math.min(clipDuration, Number(t.end) - clipStart));
    const text = String(t.text || '').trim();

    if (!text || end <= start) {
      continue;
    }

    srtLines.push(`${index}`);
    srtLines.push(`${formatTime(start)} --> ${formatTime(end)}`);
    srtLines.push(text);
    srtLines.push('');
    index += 1;
  }

  return srtLines.join('\n');
}

function burnSubtitles(inputFile, outputFile, srtContent) {
  const videoDir = path.dirname(inputFile);
  const srtPath = path.join(videoDir, `${path.parse(inputFile).name}.srt`);
  fs.writeFileSync(srtPath, srtContent, 'utf8');

  const subtitleStyle = [
    'Alignment=5',
    'MarginV=0',
    'Fontsize=42',
    'PrimaryColour=&H00FFFFFF',
    'OutlineColour=&H00000000',
    'Bold=1',
  ].join(',');

  const args = [
    '-y',
    '-i',
    inputFile,
    '-vf',
    `subtitles=${path.basename(srtPath)}:force_style='${subtitleStyle}'`,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-c:a',
    'copy',
    outputFile,
  ];

  console.log(`Burning subtitles into ${path.basename(inputFile)}...`);
  const result = spawnSync(ffmpegStatic, args, { stdio: 'inherit', cwd: videoDir });

  try {
    fs.rmSync(srtPath, { force: true });
  } catch (err) {
    // Ignore cleanup errors.
  }

  if (result.status !== 0) {
    console.log('Burn-in failed, keeping the original file.');
    return false;
  }

  return true;
}

function main() {
  const clips = readClips();
  const transcript = readTranscript();

  const legacySubtitleFile = path.join(OUTPUTS_DIR, 'subs.srt');
  if (fs.existsSync(legacySubtitleFile)) {
    fs.rmSync(legacySubtitleFile, { force: true });
  }

  console.log('Adding timed subtitles to rendered clips...\n');

  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i];
    const clipNumber = String(i + 1).padStart(2, '0');
    const inputFile = findRenderedClipFile(clipNumber, clip.title);

    if (!inputFile) {
      console.log(`Skipping ${clipNumber}: rendered output not found`);
      continue;
    }

    const clipStart = Number(clip.start);
    const clipEnd = Number(clip.end);
    const tempOutputFile = inputFile.replace(/\.mp4$/i, '_subtitled.mp4');
    const srtContent = buildSrtContent(transcript, clipStart, clipEnd);
    const subtitleCount = srtContent ? srtContent.split('\n\n').filter(Boolean).length : 0;
    const clipTitle = clip.title || `Clip ${clipNumber}`;

    console.log(`Clip ${clipNumber}: ${clipTitle}`);
    console.log(`Duration: ${(clipEnd - clipStart).toFixed(1)}s`);
    console.log(`Subtitle cues: ${subtitleCount}\n`);

    if (burnSubtitles(inputFile, tempOutputFile, srtContent)) {
      fs.rmSync(inputFile, { force: true });
      fs.renameSync(tempOutputFile, inputFile);
      console.log(`Added burned subtitles to ${path.basename(inputFile)}\n`);
    } else {
      if (fs.existsSync(tempOutputFile)) {
        fs.rmSync(tempOutputFile, { force: true });
      }
      console.log(`Failed to add subtitles to ${clipNumber}\n`);
    }
  }

  console.log('Done!');
}

main();
