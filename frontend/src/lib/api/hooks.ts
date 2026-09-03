import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { MeResponse, Society } from './types'
import { useAuthStore } from '@/stores/auth-store'

export function useMe() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: ['me', token ?? null],
    queryFn: () => api.get<MeResponse>('/me'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useSocieties() {
  return useQuery({
    queryKey: ['societies'],
    queryFn: () => api.get<Society[]>('/societies'),
    staleTime: 5 * 60 * 1000,
  })
}
