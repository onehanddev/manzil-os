describe('password auth', () => {
  it('shows mobile-password login without SMS OTP controls', () => {
    cy.visit('/login')

    cy.findByLabelText('Mobile number').should('be.visible')
    cy.findByLabelText('Password').should('be.visible')
    cy.contains('button', 'Sign in').should('be.visible')
    cy.contains('button', 'Continue in demo mode').should('be.visible')
    cy.contains('button', 'Send OTP').should('not.exist')
    cy.findByLabelText('OTP').should('not.exist')
  })
})
