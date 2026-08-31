import { defineConfig } from 'cypress'

export default defineConfig({
  experimentalMemoryManagement: true,
  numTestsKeptInMemory: 1,
  e2e: {
    baseUrl: 'http://localhost:5173',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    video: false,
    screenshotOnRunFailure: true,
  },
})
