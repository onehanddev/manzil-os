import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  displayName: string
  mobile: string
}

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  setAuth: (auth: { accessToken: string; user: AuthUser }) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: ({ accessToken, user }) => set({ accessToken, user }),
      clear: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'manzil-auth',
      partialize: (s) => ({ accessToken: s.accessToken, user: s.user }),
    },
  ),
)
