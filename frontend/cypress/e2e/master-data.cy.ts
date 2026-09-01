let sequence = 0

function unique(prefix: string) {
  sequence += 1
  return `${prefix}-${sequence.toString().padStart(3, '0')}`
}

function navigateTo(label: string) {
  cy.findByRole('button', 'More').click()
  cy.contains('[role="dialog"] a', label).click()
}

function createFlatCategory(name: string, amount = '') {
  navigateTo('Flat categories')
  cy.findByRole('button', 'Add category').click()
  cy.findByLabel('Category name').type(name)
  if (amount) cy.findByLabel('Default maintenance amount').type(amount)
  cy.findByRole('button', 'Create category').click()
  cy.findByText('Flat category created').should('exist')
  cy.findByText(name).should('be.visible')
}

function createFlat(flatNumber: string, category: string) {
  navigateTo('Flats')
  cy.findByRole('button', 'Add flat').click()
  cy.findByLabel('Flat number').type(flatNumber)
  cy.findByLabel('Category').click()
  cy.contains('[role="option"]', category).click()
  cy.findByRole('button', 'Create flat').click()
  cy.findByText('Flat created').should('exist')
  cy.contains('button', flatNumber).should('be.visible')
}

function createPerson(name: string, mobile: string) {
  navigateTo('People')
  cy.findByRole('button', 'Add person').click()
  cy.findByLabel('Name').type(name)
  cy.findByLabel('Mobile').type(mobile)
  cy.findByRole('button', 'Create person').click()
  cy.findByText('Person created').should('exist')
  cy.findByText(name).should('be.visible')
}

describe('Slice 6 — flats, people, and configuration', () => {
  beforeEach(() => {
    sequence = 0
    cy.mobileViewport()
    cy.resetMockApi()
    cy.loginDemo()
  })

  it('opens grouped configuration destinations from More', () => {
    cy.findByRole('button', 'More').click()
    cy.findByText('Society setup').should('be.visible')
    cy.findByText('Financial setup').should('be.visible')
    cy.findByRole('link', 'PeopleOwners, tenants, and contacts').click()
    cy.url().should('include', '/people')
    cy.findByRole('heading', 'People').should('be.visible')
    cy.get('[role="dialog"]').should('not.exist')
  })

  it('creates, searches, and opens a flat with its category default', () => {
    const category = unique('2-BHK')
    const flat = unique('A')
    createFlatCategory(category, '2500')
    createFlat(flat, category)

    cy.get('input[aria-label="Search flats"]').type(flat)
    cy.contains('button', flat).should('be.visible').click()
    cy.findByRole('heading', `Flat ${flat}`).should('be.visible')
    cy.findByText('₹2,500').should('be.visible')
    cy.findByText('No ledger activity yet.').should('not.exist')
    cy.findByText('Opening due').should('be.visible')
  })

  it('adds a tenant contextually and immediately makes them the default payer', () => {
    const category = unique('OCC-CAT')
    const flat = unique('OCC')
    const tenant = unique('Tenant')
    createFlatCategory(category)
    createFlat(flat, category)
    createPerson(tenant, '9000044444')

    navigateTo('Flats')
    cy.contains('button', flat).click()
    cy.findByRole('button', 'Add tenant').click()
    cy.findByLabel('Person').click()
    cy.contains('[role="option"]', tenant).click()
    cy.findByRole('button', 'Add tenant').click()
    cy.findByText('Occupant added').should('exist')
    cy.findByText(tenant).should('be.visible')
    cy.findByText('Tenant · Default payer').should('be.visible')
  })

  it('updates opening due inside flat detail and refreshes the balance', () => {
    const category = unique('DUE-CAT')
    const flat = unique('DUE')
    createFlatCategory(category)
    createFlat(flat, category)

    cy.contains('button', flat).click()
    cy.findByRole('button', 'Edit opening due').click()
    cy.findByLabel('Opening due').clear().type('2500')
    cy.findByRole('button', 'Save opening due').click()
    cy.findByText('Opening due updated').should('exist')
    cy.findByText('₹2,500').should('be.visible')
  })

  it('creates and searches people on the dedicated screen', () => {
    const person = unique('Owner')
    createPerson(person, '9000011111')
    cy.get('input[aria-label="Search people"]').type('1111')
    cy.findByText(person).should('be.visible')

    cy.get('input[aria-label="Search people"]').clear()
    cy.findByRole('button', 'Add person').click()
    cy.findByLabel('Name').type(unique('Tenant'))
    cy.findByLabel('Mobile').type('9000022222')
    cy.findByRole('button', 'Create person').click()
    cy.findByText('Person created').should('exist')
  })

  it('edits and safely deactivates a flat category', () => {
    const category = unique('EDIT-CAT')
    createFlatCategory(category, '1500')
    cy.contains('button', category).click()
    cy.findByLabel('Default maintenance amount').clear().type('1800')
    cy.findByRole('button', 'Save default amount').click()
    cy.findByText('₹1,800 default').should('be.visible')

    cy.contains('button', category).click()
    cy.findByRole('button', 'Deactivate category').click()
    cy.contains('Existing flats keep this category').should('be.visible')
    cy.findByRole('button', 'Deactivate').click()
    cy.findByText('Inactive').should('be.visible')
  })

  ;[
    { path: '/funds', heading: 'Funds', add: 'Add fund', label: 'Fund name', create: 'Create fund', name: 'Repair Fund' },
    { path: '/vendors', heading: 'Vendors', add: 'Add vendor', label: 'Vendor name', create: 'Create vendor', name: 'Lift Care' },
    { path: '/expense-categories', heading: 'Expense Categories', add: 'Add expense category', label: 'Category name', create: 'Create expense category', name: 'Water' },
  ].forEach(({ path, heading, add, label, create, name }) => {
    it(`creates and searches ${heading.toLowerCase()} on a dedicated screen`, () => {
      cy.visit(path)
      cy.findByRole('heading', heading).should('be.visible')
      cy.get('[role="tab"]').should('not.exist')
      cy.findByRole('button', add).click()
      cy.findByLabel(label).type(name)
      cy.findByRole('button', create).click()
      cy.findByText(name).should('be.visible')
      cy.get(`input[aria-label="Search ${heading.toLowerCase()}"]`).type(name)
      cy.findByText(name).should('be.visible')
    })
  })

  ;['iphone-x', 'small-phone'].forEach((viewport) => {
    it(`has no horizontal page overflow at ${viewport}`, () => {
      cy.mobileViewport(viewport as 'iphone-x' | 'small-phone')
      cy.visit('/flats')
      cy.findByRole('heading', 'Flats').should('be.visible')
      cy.get('body').then(($body) => {
        expect($body[0].scrollWidth).to.be.lte($body[0].clientWidth + 1)
      })
    })
  })
})
