export function loginDemo() {
  cy.visit('/login')
  cy.contains('button', 'Continue in demo mode').click()
  cy.url().should('include', '/dashboard')
  // ensure shell loaded
  cy.contains('Lotus Divine').should('be.visible')
}

export function mobileViewport(size: 'iphone-x' | 'small-phone' = 'iphone-x') {
  if (size === 'small-phone') {
    cy.viewport(360, 800)
    return
  }
  cy.viewport(375, 812)
}

export function resetMockApi() {
  cy.visit('/login')
  cy.window().should((win) => {
    expect((win as unknown as { __manzilMockApi?: { reset: () => void } }).__manzilMockApi, 'mock API controls should be exposed in VITE_MOCK_API mode').to.exist
  }).then((win) => {
    const mockApi = (win as unknown as { __manzilMockApi: { reset: () => void } }).__manzilMockApi
    expect(mockApi, 'mock API controls should be exposed in VITE_MOCK_API mode').to.exist
    mockApi.reset()
  })
  cy.clearLocalStorage()
}

function byExactText(text: string) {
  return new RegExp(`^${Cypress._.escapeRegExp(text)}$`)
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      loginDemo(): Chainable<void>
      mobileViewport(size?: 'iphone-x' | 'small-phone'): Chainable<void>
      resetMockApi(): Chainable<void>
      findByRole(role: string, name: string): Chainable<JQuery<HTMLElement>>
      findByLabel(label: string): Chainable<JQuery<HTMLElement>>
      findByText(text: string): Chainable<JQuery<HTMLElement>>
    }
  }
}

Cypress.Commands.add('loginDemo', loginDemo)
Cypress.Commands.add('mobileViewport', mobileViewport)
Cypress.Commands.add('resetMockApi', resetMockApi)
Cypress.Commands.add('findByRole', (role: string, name: string) => {
  if (role === 'heading') return cy.contains('h1:visible,h2:visible,h3:visible,h4:visible,h5:visible,h6:visible,[role="heading"]:visible', byExactText(name))
  if (role === 'button') return cy.contains('button:visible,[role="button"]:visible', byExactText(name))
  if (role === 'link') return cy.contains('a:visible,[role="link"]:visible', byExactText(name))
  return cy.contains(`[role="${role}"]:visible`, byExactText(name))
})
Cypress.Commands.add('findByLabel', (label: string) => {
  return cy.contains('label', byExactText(label)).invoke('attr', 'for').then((id) => {
    expect(id, `label "${label}" should target a form control`).to.be.a('string').and.not.be.empty
    return cy.get(`#${CSS.escape(id as string)}`)
  })
})
Cypress.Commands.add('findByText', (text: string) => cy.contains(byExactText(text)))
