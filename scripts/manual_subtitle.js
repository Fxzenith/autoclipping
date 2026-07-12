const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const ROOT_DIR = path.join(__dirname, '..');
const transcriptPath = path.join(ROOT_DIR, 'data', 'transcript.json');
const clip = { start: 359.12, end: 370.88 };

function formatSRT(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')},${ms.toString().padStart(3,'0')}`;
}

const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8')).transcript;
const filtered = transcript.filter(t => t.end >= clip.start && t.start <= clip.end);

let srtContent = '';
let idx = 1;
for (const t of filtered) {
  const clampedStart = Math.max(0, t.start - clip.start);
  const clampedEnd = Math.min(clip.end - clip.start, t.end - clip.start);
  if (clampedEnd <= 0 || clampedStart >= clip.end - clip.start) continue;
  const startTime = formatSRT(clampedStart);
  const endTime = formatSRT(clampedEnd);
  const text = t.text.trim();
  if (text) {
    srtContent += `${idx}\n${startTime} --> ${endTime}\n${text}\n\n`;
    idx++;
  }
}

fs.writeFileSync(path.join(ROOT_DIR, 'Outputs', 'subs.srt'), srtContent);
console.log('SRT created');

const inputFile = path.join(ROOT_DIR, 'Outputs', '02_duolingo_s_60_screens.mp4');
const outputFile = path.join(ROOT_DIR, 'Outputs', '02_duolingo_s_60_screens_subtitled.mp4');

const srtSrc = path.join(ROOT_DIR, 'Outputs', 'subs.srt');
const args = [
  '-y',
  '-i', inputFile,
  '-i', srtSrc,
  '-filter_complex', '[0:v][1:s]overlay[v]',
  '-map', '[v]',
  '-map', '0:a?',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '23',
  '-c:a', 'copy',
  outputFile
];

spawnSync(ffmpegStatic, args, { cwd: ROOT_DIR, stdio: 'inherit' });
console.log('Done!');