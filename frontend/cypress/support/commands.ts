export function loginDemo() {
  cy.visit('/login')
  cy.contains('button', 'Continue in demo mode').click()
  cy.url().should('include', '/dashboard')
  // ensure shell loaded
  cy.contains('Lotus Divine').should('be.visible')
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      loginDemo(): Chainable<void>
    }
  }
}

Cypress.Commands.add('loginDemo', loginDemo)
