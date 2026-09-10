'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { GoogleSignInButton } from './GoogleSignInButton';
import { LandingHeader } from './LandingHeader';

const RackCanvas = dynamic(() => import('./RackCanvas').then((m) => m.RackCanvas), { ssr: false, loading: () => null });

const BEATS = [
  { title: 'We watch your channels.', body: "Add any YouTube channel you care about and we'll keep an eye on it around the clock — no tabs to leave open, nothing to check yourself." },
  { title: 'The moment they go live, we start recording.', body: "The second a stream starts, we're already capturing it — even if it was already live when you added the channel." },
  { title: '...and save it straight to your own channel.', body: "Once the stream ends, we upload the full recording for you automatically. No downloading, no re-uploading, nothing to remember." },
  { title: 'Set it up once. Never miss a stream again.', body: 'Sign in and start watching — your archive builds itself from here.' },
];

const TOTAL_VH = BEATS.length * 100;

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Drives the whole scroll-linked story: a normal-flow spacer gives the page
 * real scrollable height, while the actual content stays `position: fixed`
 * and reacts to plain window scroll -- no scroll-capture library, no hijacked
 * wheel events, so the browser's native scrollbar/momentum/accessibility all
 * keep working exactly as expected.
 */
export function ScrollStory() {
  const offsetRef = useRef(0);
  const [beatIndex, setBeatIndex] = useState(0);

  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const o = max > 0 ? clamp01(window.scrollY / max) : 0;
      offsetRef.current = o;
      const idx = Math.min(BEATS.length - 1, Math.floor(o * BEATS.length));
      setBeatIndex((prev) => (prev === idx ? prev : idx));
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const beat = BEATS[beatIndex];

  return (
    <div style={{ height: `${TOTAL_VH}vh` }} className="relative">
      <div className="fixed inset-0">
        <LandingHeader />

        {/* Full-bleed 3D backdrop -- the racks/module fill the whole frame instead of sharing it with a text column. */}
        <div className="absolute inset-0">
          <RackCanvas offsetRef={offsetRef} />
        </div>

        {/* Bottom scrim so the caption stays legible over whatever's happening in the scene behind it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[65%]"
          style={{ background: 'linear-gradient(to top, #05070a 0%, rgba(5,7,10,0.85) 40%, transparent 100%)' }}
        />

        {/* Caption, lower-third style -- deliberately off the vertical center so it never sits over the module's flight path. */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-6 pb-16 sm:pb-20">
          <div className="w-full max-w-xl text-center">
            <span
              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              className="text-xs uppercase tracking-[0.2em] text-indigo-400"
            >
              {String(beatIndex + 1).padStart(2, '0')} / {String(BEATS.length).padStart(2, '0')}
            </span>
            <h2
              style={{ fontFamily: 'var(--font-sora)' }}
              className="mt-3 text-2xl font-semibold leading-tight text-gray-50 sm:text-4xl"
            >
              {beat.title}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-gray-400 sm:text-base">{beat.body}</p>
            {beatIndex === BEATS.length - 1 && (
              <div className="mt-7 flex justify-center">
                <GoogleSignInButton />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
