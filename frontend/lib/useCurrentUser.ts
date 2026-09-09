'use client';

import { useEffect, useState } from 'react';
import type { AppUser } from './types';
import { api } from './api';

export interface CurrentUserState {
  loading: boolean;
  user: AppUser | null;
}

/** Shared by every page that needs to know "who's logged in" -- the dashboard and the admin Console. */
export function useCurrentUser(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({ loading: true, user: null });

  useEffect(() => {
    api
      .getMe()
      .then((res) => setState({ loading: false, user: res.authenticated ? res.user! : null }))
      .catch(() => setState({ loading: false, user: null }));
  }, []);

  return state;
}
