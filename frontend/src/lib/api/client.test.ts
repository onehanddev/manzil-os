import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

test('uses the production API origin from VITE_API_URL', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.manzilos.com/api')
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true })),
  )

  const { api } = await import('./client')

  await api.get('/me')

  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.manzilos.com/api/me',
    expect.objectContaining({ method: 'GET' }),
  )
})
