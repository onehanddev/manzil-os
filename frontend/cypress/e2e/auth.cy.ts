describe('auth', () => {
  beforeEach(() => {
    cy.resetMockApi()
  })

  it('redirects unauthenticated users to /login', () => {
    cy.visit('/dashboard')
    cy.url().should('include', '/login')
  })

  it('signs in via demo mode and shows the app shell', () => {
    cy.mobileViewport()
    cy.visit('/login')
    cy.contains('button', 'Continue in demo mode').click()
    cy.url().should('include', '/dashboard')

    // Bottom navigation (mobile shell) is present.
    cy.findByRole('link', 'Receipts').should('be.visible')
    cy.findByRole('link', 'Expenses').should('be.visible')

    // Society switcher shows the demo society.
    cy.contains('Lotus Divine').should('be.visible')
  })
})
