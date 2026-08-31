/**
 * Supabase OTP E2E — local stack without Twilio.
 * Uses numbers in supabase/config.toml [auth.sms.test_otp] where OTP is always 123456.
 * This test reproduces the "invalid API key" issue when frontend .env is stale or wrong.
 */
describe('Supabase OTP — local (no Twilio)', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    // ensure local supabase is reachable (health check)
    cy.request({
      method: 'GET',
      url: 'http://127.0.0.1:54321/auth/v1/health',
      failOnStatusCode: false,
    }).its('status').should('be.oneOf', [200, 404]) // GoTrue health may be 200 or 404 depending on version
  })

  it('backend OTP via local Supabase returns test-otp and verifies', () => {
    // Direct backend check - bypass frontend, proves Supabase is up
    cy.request({
      method: 'POST',
      url: 'http://127.0.0.1:54321/auth/v1/otp',
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        'Content-Type': 'application/json',
      },
      body: { phone: '+919000001111' },
    }).its('body').should('have.property', 'message_id')

    cy.request({
      method: 'POST',
      url: 'http://127.0.0.1:54321/auth/v1/verify',
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        'Content-Type': 'application/json',
      },
      body: { phone: '+919000001111', token: '123456', type: 'sms' },
    }).its('body').should('have.property', 'access_token')
  })

  it('frontend can send OTP and verify with 123456 (no invalid API key)', () => {
    cy.visit('/login')

    // Step 1: enter phone and send OTP
    cy.get('#phone').clear().type('+919999999999')
    cy.contains('button', 'Send OTP').click()

    // If API key is wrong, an error appears instead of OTP step
    cy.get('body').should('not.contain.text', 'Invalid API key')
    cy.get('body').should('not.contain.text', 'invalid API key')
    cy.contains('OTP sent to', { timeout: 10000 }).should('be.visible')
    cy.get('#otp').should('be.visible')

    // Step 2: enter test OTP and verify
    cy.get('#otp').clear().type('123456')
    cy.contains('button', 'Verify').click()

    // Should not show invalid API key on verify either
    cy.get('body', { timeout: 10000 }).should('not.contain.text', 'Invalid API key')
    // Successful verify redirects to /dashboard (or shows pending logic via backend)
    cy.url({ timeout: 15000 }).should('not.include', '/login')
    cy.contains('Manzil OS').should('not.exist') // login card gone
    // Dashboard shell loads
    cy.url().should('include', '/dashboard')
  })

  it('wrong OTP shows error', () => {
    cy.visit('/login')
    cy.get('#phone').clear().type('+919000009999')
    cy.contains('button', 'Send OTP').click()
    cy.contains('OTP sent to', { timeout: 10000 }).should('be.visible')
    cy.get('#otp').clear().type('000000')
    cy.contains('button', 'Verify').click()
    cy.contains(/Could not verify OTP|Token has expired|invalid/i, { timeout: 10000 }).should('be.visible')
  })
})
