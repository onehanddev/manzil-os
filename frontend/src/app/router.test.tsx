import { afterEach, describe, expect, it } from 'vitest'

describe('PWA router deployment', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('does not use /app as a basename when opened from the former subroute', async () => {
    window.history.replaceState({}, '', '/app/dashboard')

    const { router } = await import('./router')

    expect(router.basename).toBe('/')
  })
})
