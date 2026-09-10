'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminUserRow } from '../lib/types';
import { api } from '../lib/api';

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'INACTIVE'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
function isStatusFilter(v: string | null): v is StatusFilter {
  return !!v && (STATUS_FILTERS as readonly string[]).includes(v);
}

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

type DisplayStatus = AdminUserRow['status'] | 'INACTIVE';

/**
 * REJECTED covers two different stories that deserve different words: a
 * PENDING request the admin turned down (never approved -- "Rejected"), and
 * an already-APPROVED user the admin later flipped off via the switch
 * ("Disabled"). Both are the same backend status; approvedAt (never set vs.
 * set) is what tells them apart here.
 */
function displayStatus(u: AdminUserRow): DisplayStatus {
  return u.status === 'REJECTED' && u.approvedAt ? 'INACTIVE' : u.status;
}

function StatusPill({ status }: { status: DisplayStatus }) {
  const styles: Record<DisplayStatus, string> = {
    PENDING: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30',
    APPROVED: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30',
    REJECTED: 'bg-gray-500/15 text-gray-400 ring-1 ring-inset ring-gray-500/30',
    INACTIVE: 'bg-gray-500/15 text-gray-400 ring-1 ring-inset ring-gray-500/30',
  };
  const labels: Record<DisplayStatus, string> = {
    PENDING: 'Pending',
    APPROVED: 'Active',
    REJECTED: 'Rejected',
    INACTIVE: 'Inactive',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/**
 * Pure CSS toggle switch -- rendered once a user has EVER been approved (see
 * the row below), and stays the control for them from then on, even after
 * using it to disable them again (which still lands them on REJECTED under
 * the hood -- there's no separate "disabled" status). Approve/Reject buttons
 * only ever handle the first decision; this switch is the way back in after that.
 */
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

function DecisionButton({
  variant,
  disabled,
  onClick,
  children,
}: {
  variant: 'approve' | 'reject';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles =
    variant === 'approve'
      ? 'bg-emerald-600/15 text-emerald-300 ring-1 ring-inset ring-emerald-600/30 hover:bg-emerald-600/25'
      : 'bg-rose-600/15 text-rose-300 ring-1 ring-inset ring-rose-600/30 hover:bg-rose-600/25';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${styles}`}
    >
      {children}
    </button>
  );
}

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // The input itself updates on every keystroke; `search` (what actually
  // filters the list and lands in the URL) only catches up 800ms after
  // typing stops, so neither the list nor the URL churns on every keypress.
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') ?? '');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const fromUrl = searchParams.get('filter');
    return isStatusFilter(fromUrl) ? fromUrl : 'ALL';
  });

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 800);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reflects the current search/filter into the URL (search params) whenever
  // either settles, so the view is shareable/bookmarkable and survives a
  // refresh -- replace (not push) so this never spams the back button.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    search ? params.set('search', search) : params.delete('search');
    statusFilter !== 'ALL' ? params.set('filter', statusFilter) : params.delete('filter');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const refresh = () => api.listUsers().then(setUsers).finally(() => setLoading(false));

  useEffect(() => {
    refresh();
  }, []);

  async function setStatus(u: AdminUserRow, approved: boolean) {
    setPendingId(u.id);
    try {
      await api.setUserActive(u.id, approved);
      await refresh();
    } finally {
      setPendingId(null);
    }
  }

  const pendingCount = users.filter((u) => u.status === 'PENDING').length;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesStatus = statusFilter === 'ALL' || displayStatus(u) === statusFilter;
      const matchesSearch = !q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [users, search, statusFilter]);

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

      <div className="flex flex-col gap-2 border-b border-gray-800 px-5 py-3 sm:flex-row sm:items-center">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none sm:max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Active</option>
          <option value="REJECTED">Rejected</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {loading && <p className="px-5 py-6 text-sm text-gray-400">Loading…</p>}
      {!loading && users.length === 0 && <p className="px-5 py-6 text-sm text-gray-400">No one has signed in yet.</p>}
      {!loading && users.length > 0 && filteredUsers.length === 0 && (
        <p className="px-5 py-6 text-sm text-gray-400">No users match your search/filter.</p>
      )}

      {!loading && filteredUsers.length > 0 && (
        <ul className="divide-y divide-gray-800">
          {filteredUsers.map((u) => {
            const isSelf = u.id === currentUserId;
            const isAdminRow = u.role === 'ADMIN';
            return (
              <li key={u.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
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
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
                  <StatusPill status={displayStatus(u)} />
                  <div className="flex shrink-0 items-center justify-end gap-2 sm:w-[150px]">
                    {u.approvedAt ? (
                      // Once someone's been approved at least once, the switch
                      // takes over for good -- even after using it to disable
                      // them (REJECTED), it stays put as the way back in,
                      // instead of reverting to the Approve/Reject buttons.
                      <ActiveToggle
                        checked={u.status === 'APPROVED'}
                        disabled={isAdminRow || isSelf || pendingId === u.id}
                        onChange={() => setStatus(u, u.status !== 'APPROVED')}
                      />
                    ) : (
                      <>
                        <DecisionButton
                          variant="approve"
                          disabled={isAdminRow || isSelf || pendingId === u.id}
                          onClick={() => setStatus(u, true)}
                        >
                          Approve
                        </DecisionButton>
                        <DecisionButton
                          variant="reject"
                          disabled={isAdminRow || isSelf || pendingId === u.id || u.status === 'REJECTED'}
                          onClick={() => setStatus(u, false)}
                        >
                          Reject
                        </DecisionButton>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
