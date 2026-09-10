'use client';

import Link from 'next/link';
import { useCurrentUser } from '../../lib/useCurrentUser';
import { LoginScreen } from '../../components/LoginScreen';
import { PendingApprovalScreen } from '../../components/PendingApprovalScreen';
import { AdminPanel } from '../../components/AdminPanel';
import { UploadDestinationsPanel } from '../../components/UploadDestinationsPanel';
import { LegalLinks } from '../../components/LegalLinks';
import { api } from '../../lib/api';

/**
 * ADMIN-only console: access requests + upload destination configuration.
 * Regular USER accounts never see a link to this page (see the dashboard's
 * header), and even if one navigates here directly, every API call the
 * panels below make is independently rejected by the backend's RolesGuard --
 * this page-level check is just what turns that into a clean "not for you"
 * screen instead of a page full of failed requests.
 */
export default function ConsolePage() {
  const { loading, user } = useCurrentUser();

  if (loading) return null;
  if (!user) return <LoginScreen />;
  if (user.status !== 'APPROVED') return <PendingApprovalScreen user={user} />;

  if (user.role !== 'ADMIN') {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-8 text-center shadow-xl">
          <h1 className="text-lg font-semibold text-gray-100">Admins only</h1>
          <p className="mt-2 text-sm text-gray-400">The Console is restricted to admin accounts.</p>
          <Link href="/" className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Console</h1>
          <p className="mt-1 text-sm text-gray-400">Access requests and upload destination configuration.</p>
        </div>
        <div className="flex items-center gap-3">
          <LegalLinks />
          <span className="text-sm text-gray-400">{user.email}</span>
          <button
            onClick={() => api.logout().then(() => window.location.reload())}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-800"
          >
            Sign out
          </button>
          <Link href="/" className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600">
            ← Dashboard
          </Link>
        </div>
      </header>

      <AdminPanel currentUserId={user.id} />
      <UploadDestinationsPanel />
    </main>
  );
}
