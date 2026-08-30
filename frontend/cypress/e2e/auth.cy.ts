describe('auth', () => {
  it('redirects unauthenticated users to /login', () => {
    cy.visit('/dashboard')
    cy.url().should('include', '/login')
  })

  it('signs in via demo mode and shows the app shell', () => {
    cy.visit('/login')
    cy.contains('button', 'Continue in demo mode').click()
    cy.url().should('include', '/dashboard')

    // Bottom navigation (mobile shell) is present.
    cy.contains('Billing').should('be.visible')
    cy.contains('Expenses').should('be.visible')

    // Society switcher shows the demo society.
    cy.contains('Lotus Divine').should('be.visible')
  })
})
