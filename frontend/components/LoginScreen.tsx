import { api } from '../lib/api';
import { LegalLinks } from './LegalLinks';

export function LoginScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-3xl"
      />

      <div className="relative w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900/80 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/15 text-indigo-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" />
          </svg>
        </div>

        <h1 className="mt-4 text-xl font-bold text-gray-100">Dicisiky's Livestreams Archive</h1>
        <p className="mt-2 text-sm text-gray-400">Sign in with the Google account you use on YouTube to request access.</p>

        <button
          onClick={() => api.loginWithGoogle()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-100"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          Sign in with Google
        </button>

        <p className="mt-5 text-xs text-gray-500">
          By continuing, you agree to the
          <br />
          <LegalLinks className="mt-1 justify-center" />
        </p>
      </div>
    </main>
  );
}
