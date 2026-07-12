import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const getCurrentSubtitle = (frame, fps, transcript) => {
  if (!transcript) return '';
  const seconds = frame / fps;
  const entry = transcript.find((t) => seconds >= t.start && seconds <= t.end);
  return entry ? entry.text : '';
};

export const ShortClip = ({ clipVideo, title, hook, transcript }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const intro = spring({
    fps,
    frame,
    config: {
      damping: 18,
      mass: 0.8,
      stiffness: 110,
    },
  });

  const overlayOpacity = interpolate(frame, [0, 10], [0.15, 0.45], {
    extrapolateRight: 'clamp',
  });

  const currentSubtitle = getCurrentSubtitle(frame, fps, transcript);

  return (
    <AbsoluteFill style={{ backgroundColor: '#050505' }}>
      {clipVideo ? (
        <OffthreadVideo
          src={clipVideo}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(180deg, #1a1a1a 0%, #050505 100%)',
          }}
        />
      )}

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.12) 35%, rgba(0,0,0,0.70) 100%)',
          opacity: overlayOpacity,
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          padding: 56,
        }}
      >
        {currentSubtitle && (
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'white',
              textAlign: 'center',
              backgroundColor: 'rgba(0,0,0,0.5)',
              padding: '16px',
              marginBottom: '100px',
              borderRadius: '8px',
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            {currentSubtitle}
          </div>
        )}

        <div
          style={{
            opacity: intro,
            transform: `translateY(${(1 - intro) * 24}px)`,
            maxWidth: '92%',
            color: '#ffffff',
            textShadow: '0 4px 20px rgba(0,0,0,0.8)',
          }}
        >
          <div
            style={{
              fontSize: 56,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: -1.2,
              marginBottom: 18,
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            {title}
          </div>

          {hook ? (
            <div
              style={{
                fontSize: 30,
                lineHeight: 1.25,
                fontWeight: 500,
                color: '#f7d55a',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
            >
              {hook}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
