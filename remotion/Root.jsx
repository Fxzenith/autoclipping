import React from 'react';
import { Composition } from 'remotion';
import { ShortClip } from './ShortClip';
import transcriptData from '../data/transcript.json';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="YTShort"
        component={ShortClip}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={FPS * 15}
        defaultProps={{
          clipVideo: '',
          duration: 15,
          title: 'Your Title Here',
          hook: 'Compelling hook text',
          transcript: transcriptData.transcript,
        }}
        calculateMetadata={({ props }) => {
          const duration = Number(props.duration) || 15;

          return {
            fps: FPS,
            width: WIDTH,
            height: HEIGHT,
            durationInFrames: Math.max(1, Math.round(duration * FPS)),
          };
        }}
      />
    </>
  );
};
