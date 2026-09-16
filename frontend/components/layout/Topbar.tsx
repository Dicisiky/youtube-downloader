'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { Clapperboard, LayoutDashboard, LogOut, Settings2, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import type { AppUser } from '../../lib/types';
import { Avatar } from '../ui/Avatar';
import { Menu, MenuItem } from '../ui/Menu';
import { buttonClasses } from '../ui/Button';
import { LegalLinks } from '../LegalLinks';

function Logo() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-glow">
        <Clapperboard className="h-[18px] w-[18px]" />
      </div>
      <span className="truncate text-sm font-semibold text-gray-100 sm:text-[15px]">
        Dicisiky&apos;s <span className="text-gray-400">Livestreams Archive</span>
      </span>
    </Link>
  );
}

interface Props {
  user: AppUser;
  page: 'dashboard' | 'console';
  status?: ReactNode;
  actions?: ReactNode;
}

/** Shared header for every authenticated screen (dashboard + console) -- keeps nav/branding/account menu identical across both. */
export function Topbar({ user, page, status, actions }: Props) {
  const isAdmin = user.role === 'ADMIN';

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          {status}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}

          {isAdmin &&
            (page === 'dashboard' ? (
              <Link href="/console" className={buttonClasses('secondary', 'sm')}>
                <Settings2 className="h-3.5 w-3.5" />
                Console
              </Link>
            ) : (
              <Link href="/" className={buttonClasses('secondary', 'sm')}>
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </Link>
            ))}

          <Menu
            align="right"
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                aria-label="Account menu"
                className={`flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors duration-150 ${open ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'}`}
              >
                <Avatar name={user.name} email={user.email} picture={user.picture} size="sm" />
              </button>
            )}
          >
            <div className="flex items-center gap-2.5 px-3 py-2">
              <Avatar name={user.name} email={user.email} picture={user.picture} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-100">{user.name ?? user.email}</p>
                <p className="truncate text-xs text-gray-500">{user.email}</p>
              </div>
            </div>
            {isAdmin && (
              <div className="mx-3 mb-1.5 flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin account
              </div>
            )}
            <div className="my-1 border-t border-white/5" />
            <MenuItem icon={<LogOut className="h-4 w-4" />} danger onClick={() => api.logout().then(() => window.location.reload())}>
              Sign out
            </MenuItem>
            <div className="my-1 border-t border-white/5" />
            <div className="px-3 py-1.5">
              <LegalLinks />
            </div>
          </Menu>
        </div>
      </div>
    </header>
  );
}
