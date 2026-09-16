import { Clock, XCircle } from 'lucide-react';
import type { AppUser } from '../lib/types';
import { api } from '../lib/api';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';

export function PendingApprovalScreen({ user }: { user: AppUser }) {
  const rejected = user.status === 'REJECTED';

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-white/10 bg-surface-raised p-8 text-center shadow-2xl shadow-black/40">
        <div className="relative mx-auto w-fit">
          <Avatar name={user.name} email={user.email} picture={user.picture} size="lg" />
          <div
            className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-surface-raised ${
              rejected ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
            }`}
          >
            {rejected ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
          </div>
        </div>
        <p className="mt-3 text-sm text-gray-400">{user.email}</p>

        {rejected ? (
          <>
            <h1 className="mt-4 text-lg font-semibold text-rose-400">Access denied</h1>
            <p className="mt-2 text-sm text-gray-400">The admin has denied your request to use this app.</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold text-gray-100">Waiting for approval</h1>
            <p className="mt-2 text-sm text-gray-400">Your request has been sent to the admin for approval.</p>
          </>
        )}

        <Button variant="ghost" className="mt-6" onClick={() => api.logout().then(() => window.location.reload())}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
