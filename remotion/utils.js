export const getClipsProps = (clipsJson, assetsDir = 'assets') => {
  return clipsJson.clips.map((clip, idx) => ({
    id: `clip_${String(idx + 1).padStart(2, '0')}`,
    clipVideo: `${assetsDir}/clip_${String(idx + 1).padStart(2, '0')}.mp4`,
    duration: clip.end - clip.start,
    title: clip.title || 'Untitled',
    hook: clip.hook || '',
    startFrame: 0,
  }));
};
