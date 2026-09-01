describe('test harness', () => {
  it('resets MSW browser data between mobile sessions', () => {
    const categoryName = 'Harness Category'

    cy.mobileViewport()
    cy.resetMockApi()
    cy.loginDemo()
    cy.visit('/flats')

    cy.findByRole('heading', 'Flats & Master Data').should('be.visible')
    cy.findByLabel('Category name').type(categoryName)
    cy.findByLabel('Maintenance amount').type('1500')
    cy.findByRole('button', 'Create category').click()
    cy.findByText('Category created').should('exist')
    cy.findByText(categoryName).should('be.visible')

    cy.resetMockApi()
    cy.loginDemo()
    cy.visit('/flats')

    cy.findByRole('heading', 'Flats & Master Data').should('be.visible')
    cy.findByText(categoryName).should('not.exist')
    cy.findByRole('button', 'Categories').should('be.visible')
    cy.findByRole('button', 'Flats').should('be.visible')
  })
})
