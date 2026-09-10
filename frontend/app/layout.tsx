import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Dicisiky's Livestreams Archive",
  description: 'Monitor, record, and re-upload YouTube livestreams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
