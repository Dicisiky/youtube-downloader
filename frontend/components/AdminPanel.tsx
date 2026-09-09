'use client';

import { useEffect, useState } from 'react';
import type { AdminUserRow } from '../lib/types';
import { api } from '../lib/api';

function initials(user: AdminUserRow): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function Avatar({ user }: { user: AdminUserRow }) {
  if (user.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.picture} alt="" className="h-9 w-9 shrink-0 rounded-full ring-1 ring-white/10" />;
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-semibold text-gray-200 ring-1 ring-white/10">
      {initials(user)}
    </div>
  );
}

function StatusPill({ status }: { status: AdminUserRow['status'] }) {
  const styles: Record<AdminUserRow['status'], string> = {
    PENDING: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30',
    APPROVED: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30',
    REJECTED: 'bg-gray-500/15 text-gray-400 ring-1 ring-inset ring-gray-500/30',
  };
  const labels: Record<AdminUserRow['status'], string> = {
    PENDING: 'Pending',
    APPROVED: 'Active',
    REJECTED: 'Inactive',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/** Pure CSS toggle switch -- checked = APPROVED (has access), unchecked = anything else (no access). */
function ActiveToggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      title={disabled ? "Admins can't be deactivated here" : checked ? 'Deactivate' : 'Activate'}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ${
        checked ? 'bg-emerald-600' : 'bg-gray-700'
      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform duration-150 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = () => api.listUsers().then(setUsers).finally(() => setLoading(false));

  useEffect(() => {
    refresh();
  }, []);

  async function toggle(u: AdminUserRow) {
    setPendingId(u.id);
    try {
      await api.setUserActive(u.id, u.status !== 'APPROVED');
      await refresh();
    } finally {
      setPendingId(null);
    }
  }

  const pendingCount = users.filter((u) => u.status === 'PENDING').length;

  return (
    <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Users</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {pendingCount > 0 ? `${pendingCount} waiting for approval` : 'Everyone who has signed in'}
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
            {pendingCount} pending
          </span>
        )}
      </div>

      {loading && <p className="px-5 py-6 text-sm text-gray-400">Loading…</p>}
      {!loading && users.length === 0 && <p className="px-5 py-6 text-sm text-gray-400">No one has signed in yet.</p>}

      {!loading && users.length > 0 && (
        <ul className="divide-y divide-gray-800">
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const isAdminRow = u.role === 'ADMIN';
            return (
              <li key={u.id} className="flex items-center gap-4 px-5 py-3">
                <Avatar user={u} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-100">{u.name ?? u.email}</span>
                    {isAdminRow && (
                      <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30">
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-gray-500">{u.email}</p>
                </div>
                <StatusPill status={u.status} />
                <ActiveToggle
                  checked={u.status === 'APPROVED'}
                  disabled={isAdminRow || isSelf || pendingId === u.id}
                  onChange={() => toggle(u)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
