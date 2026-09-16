import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-canvas px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Home page
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-100">{title}</h1>
      <p className="mt-1 text-xs text-gray-500">Last updated {updated}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-300 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-100 [&_h2]:first:mt-0 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:mt-2">
        {children}
      </div>
    </main>
  );
}
