'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useCurrentUser } from '../../lib/useCurrentUser';
import { LoginScreen } from '../../components/LoginScreen';
import { PendingApprovalScreen } from '../../components/PendingApprovalScreen';
import { AdminPanel } from '../../components/AdminPanel';
import { UploadDestinationsPanel } from '../../components/UploadDestinationsPanel';
import { Topbar } from '../../components/layout/Topbar';
import { Button } from '../../components/ui/Button';

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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </main>
    );
  }
  if (!user) return <LoginScreen />;
  if (user.status !== 'APPROVED') return <PendingApprovalScreen user={user} />;

  if (user.role !== 'ADMIN') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface-raised p-8 text-center shadow-2xl shadow-black/40 animate-scale-in">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-gray-100">Admins only</h1>
          <p className="mt-2 text-sm text-gray-400">The Console is restricted to admin accounts.</p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="primary">Back to dashboard</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Topbar user={user} page="console" />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-xl font-bold text-gray-100 sm:text-2xl">Console</h1>
          <p className="mt-1 text-sm text-gray-400">Access requests and upload destination configuration.</p>
        </div>

        <Suspense fallback={null}>
          <AdminPanel currentUserId={user.id} />
        </Suspense>
        <UploadDestinationsPanel />
      </main>
    </div>
  );
}
