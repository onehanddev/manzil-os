import { setupWorker } from 'msw/browser'
import { handlers, resetMockData } from './handlers'

export const worker = setupWorker(...handlers)

declare global {
  interface Window {
    __manzilMockApi?: {
      reset: () => void
    }
  }
}

window.__manzilMockApi = {
  reset: resetMockData,
}
