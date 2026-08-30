import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'
import { useAuthStore } from '@/stores/auth-store'
import { useSocietyStore } from '@/stores/society-store'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
  useAuthStore.getState().clear()
  useSocietyStore.getState().setCurrentSociety(null)
})

afterAll(() => server.close())
