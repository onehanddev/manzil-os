import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { MeResponse, Society } from './types'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
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
