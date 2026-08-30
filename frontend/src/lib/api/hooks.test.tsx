import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMe } from './hooks'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useMe', () => {
  it('fetches the current user and their society memberships', async () => {
    const { result } = renderHook(() => useMe(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.user.display_name).toBe('Dev User')
    expect(result.current.data?.memberships).toHaveLength(2)
    expect(result.current.data?.memberships[0].society.name).toBe('Lotus Divine')
    expect(result.current.data?.memberships[0].roles).toContain('super_admin')
  })
})
