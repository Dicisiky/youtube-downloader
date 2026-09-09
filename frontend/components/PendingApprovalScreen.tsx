import type { AppUser } from '../lib/types';
import { api } from '../lib/api';

export function PendingApprovalScreen({ user }: { user: AppUser }) {
  const rejected = user.status === 'REJECTED';

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-8 text-center shadow-xl">
        {user.picture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" className="mx-auto h-14 w-14 rounded-full" />
        )}
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

        <button
          onClick={() => api.logout().then(() => window.location.reload())}
          className="mt-6 rounded-md px-4 py-2 text-sm font-medium text-gray-400 hover:bg-gray-800"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
