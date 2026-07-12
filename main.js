#!/usr/bin/env node
/**
 * YT Clipper main orchestrator.
 *
 * Pipeline:
 * 1. Fetch transcript
 * 2. Ask Claude to create clips.json and review.md
 * 3. Wait for approval
 * 4. Download and cut clips
 * 5. Render final shorts
 * 6. Burn timed subtitles into the rendered clips
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const TRANSCRIPT_PATH = path.join(DATA_DIR, 'transcript.json');
const CLIPS_PATH = path.join(DATA_DIR, 'clips.json');
const REVIEW_PATH = path.join(DATA_DIR, 'clips_review.md');
const FACEBOOK_POST_SCRIPT = path.join(ROOT_DIR, 'marketing pipeline', 'post_to_facebook.js');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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

function fetchTranscript(videoUrl) {
  console.log('\n[1/5] Fetching transcript...');
  ensureDataDir();
  runCommand('python', ['python/transcript.py', '--url', videoUrl, '--out', TRANSCRIPT_PATH], 'Transcript fetch');

  if (!fs.existsSync(TRANSCRIPT_PATH)) {
    throw new Error(`Transcript file not found at ${TRANSCRIPT_PATH}`);
  }

  try {
    const raw = fs.readFileSync(TRANSCRIPT_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse transcript.json: ${err.message}`);
  }
}

function waitForClipSelection() {
  console.log('\n[2/5] Claude clip selection');
  console.log(' Create the following files before continuing:');
  console.log(' - data/clips.json');
  console.log(' - data/clips_review.md');
  console.log('');
  console.log('  Suggested clip criteria:');
  console.log('  - 5 to 10 clips');
  console.log('  - 10 to 25 seconds each');
  console.log('  - include title, start, end, hook, and reason');
  console.log('  - make the review readable for timestamp approval');
}

async function waitForApproval(autoApprove = false) {
  console.log('\n[3/5] Approval gate');

  const reviewExists = fs.existsSync(REVIEW_PATH);
  if (!reviewExists) {
    throw new Error('Missing data/clips_review.md. Generate the review before continuing.');
  }

  if (!fs.existsSync(CLIPS_PATH)) {
    throw new Error('Missing data/clips.json. Generate the clip manifest before continuing.');
  }

  const clipsData = JSON.parse(fs.readFileSync(CLIPS_PATH, 'utf8'));
  const clips = Array.isArray(clipsData.clips) ? clipsData.clips : [];

  const invalidClips = clips.filter((clip, idx) => {
    return !clip.title || !clip.hook || typeof clip.start !== 'number' || typeof clip.end !== 'number';
  });

  if (invalidClips.length > 0) {
    throw new Error(`Invalid clips.json: ${invalidClips.length} clip(s) missing required fields (title, hook, start, end)`);
  }

  console.log(' Review file found: data/clips_review.md');

  if (autoApprove) {
    console.log('  Auto-approved via --approve');
    return;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Approve and continue? (yes/no): ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === 'yes' || normalized === 'y') {
        resolve();
        return;
      }

      console.log('Cancelled.');
      process.exit(0);
    });
  });
}

function extractClips(videoUrl) {
  console.log('\n[4/5] Downloading and cutting clips...');
  runCommand('node', ['scripts/extract.js', videoUrl], 'Clip extraction');
}

function renderVideos() {
  console.log('\n[5/5] Rendering final videos...');
  runCommand('node', ['scripts/render.js'], 'Rendering');
}

function burnSubtitles() {
  console.log('\n[6/6] Burning timed subtitles...');
  runCommand('node', ['scripts/add_subtitles.js'], 'Subtitle burn-in');
}

function postToFacebook() {
  console.log('\n[7/7] Posting to Facebook...');
  runCommand('node', [FACEBOOK_POST_SCRIPT], 'Facebook posting');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('-')) {
    console.log('Usage: node main.js <youtube_url> [--approve] [--skip-render] [--skip-subtitles] [--facebook]');
    console.log('Example: node main.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --approve');
    process.exit(1);
  }

  const videoUrl = args[0];
  const autoApprove = args.includes('--approve');
  const skipRender = args.includes('--skip-render');
  const skipSubtitles = args.includes('--skip-subtitles');
  const postToFacebookEnabled = args.includes('--facebook');

  console.log('============================================================');
  console.log('YT Clipper - YouTube Shorts Generator');
  console.log('============================================================');

  const transcript = fetchTranscript(videoUrl);
  console.log(`  Retrieved ${Array.isArray(transcript.transcript) ? transcript.transcript.length : 0} transcript entries`);

  waitForClipSelection();

  console.log('');
  console.log('Press ENTER after Claude has generated clips.json and review.md...');
  await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });

  await waitForApproval(autoApprove);
  extractClips(videoUrl);

  if (!skipRender) {
    renderVideos();
  } else {
    console.log('\nRender skipped via --skip-render');
  }

  if (!skipRender && !skipSubtitles) {
    burnSubtitles();
  } else if (skipSubtitles) {
    console.log('\nSubtitle burn-in skipped via --skip-subtitles');
  }

  if (postToFacebookEnabled) {
    if (skipRender) {
      throw new Error('Cannot post to Facebook when render is skipped. Remove --skip-render or omit --facebook.');
    }
    postToFacebook();
  }

  console.log('\n============================================================');
  console.log('Pipeline complete');
  console.log('  Clips:    assets/');
  console.log('  Output:   Outputs/');
  console.log('  Video:    video/full.mp4');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
