import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}

function ensureTestStorage() {
  if (typeof window.localStorage.setItem === 'function' && typeof window.localStorage.clear === 'function') {
    return
  }
  const storage = createMemoryStorage()
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}

beforeAll(() => {
  ensureTestStorage()
  server.listen({ onUnhandledRequest: 'error' })
})

ensureTestStorage()

afterEach(async () => {
  ensureTestStorage()
  server.resetHandlers()
  cleanup()
  window.localStorage.clear()
  const { useAuthStore } = await import('@/stores/auth-store')
  const { useSocietyStore } = await import('@/stores/society-store')
  useAuthStore.getState().clear()
  useSocietyStore.getState().setCurrentSociety(null)
})

afterAll(() => server.close())
