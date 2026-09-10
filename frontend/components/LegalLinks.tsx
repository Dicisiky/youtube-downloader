import Link from 'next/link';

/** Small "Privacy · Terms" link pair, reused in every header/footer that needs it. */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs text-gray-500 ${className}`}>
      <Link href="/privacy" className="hover:text-gray-300">
        Privacy Policy
      </Link>
      <span className="text-gray-700">·</span>
      <Link href="/terms" className="hover:text-gray-300">
        Terms &amp; Conditions
      </Link>
    </div>
  );
}
