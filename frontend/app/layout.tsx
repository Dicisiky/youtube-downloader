import type { Metadata } from 'next';
import { JetBrains_Mono, Sora } from 'next/font/google';
import './globals.css';

// Exposed as CSS variables (not the default className swap) so any component
// can opt into them with `style={{ fontFamily: 'var(--font-sora)' }}` --
// notably the landing/ScrollStory beats, which sit outside this file.
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });

export const metadata: Metadata = {
  title: "Dicisiky's Livestreams Archive",
  description: 'Monitor, record, and re-upload YouTube livestreams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
