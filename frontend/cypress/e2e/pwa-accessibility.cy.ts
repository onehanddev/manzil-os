describe('production PWA and accessibility', () => {
  function enterDemo() {
    cy.visit('/login')
    cy.findByRole('button', 'Continue in demo mode').click()
    cy.findByRole('heading', 'Home').should('be.visible')
  }

  afterEach(() => {
    cy.then(() => Cypress.automation('remote:debugger:protocol', {
      command: 'Network.emulateNetworkConditions',
      params: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    }))
  })

  it('publishes an installable monochrome manifest and registers its service worker', () => {
    cy.request('/manifest.webmanifest').its('body').should((manifest) => {
      expect(manifest).to.include({
        name: 'Manzil OS',
        short_name: 'Manzil',
        display: 'standalone',
        theme_color: '#18181b',
        background_color: '#ffffff',
      })
      expect(manifest.icons).to.have.length.at.least(3)
    })

    cy.visit('/login')
    cy.window().then((win) => win.navigator.serviceWorker.ready)
      .its('active').should('exist')
  })

  it('has no serious accessibility violations in representative login and app-shell states', () => {
    cy.visit('/login')
    cy.injectAxe()
    cy.checkA11y(undefined, { includedImpacts: ['critical', 'serious'] })

    cy.findByRole('button', 'Continue in demo mode').click()
    cy.findByRole('heading', 'Home').should('be.visible')
    cy.injectAxe()
    cy.checkA11y(undefined, { includedImpacts: ['critical', 'serious'] }, (violations) => {
      if (violations.length > 0) {
        throw new Error(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`).join('\n'))
      }
    })
  })

  it('serves the standalone app shell during a connectivity loss', () => {
    cy.visit('/login')
    cy.window().then((win) => win.navigator.serviceWorker.ready)
    cy.reload()
    cy.then(() => Cypress.automation('remote:debugger:protocol', {
      command: 'Network.emulateNetworkConditions',
      params: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
    }))

    cy.visit('/dashboard')
    cy.findByText('Manzil OS').should('be.visible')
  })

  ;[320, 360, 375].forEach((width) => {
    it(`keeps navigation and content usable at ${width}px with 200% text`, () => {
      cy.viewport(width, 812)
      enterDemo()
      cy.document().then((doc) => {
        doc.documentElement.style.fontSize = '200%'
      })

      cy.get('body').should(($body) => {
        expect($body[0].scrollWidth).to.be.at.most($body[0].clientWidth)
      })
      cy.get('nav[aria-label="Primary"]').should('be.visible')
      cy.findByRole('button', 'More').should('be.visible').click()
      cy.get('[role="dialog"]').should('be.visible').and('contain.text', 'More')
      cy.get('[data-slot="sheet-content"]').should(($sheet) => {
        const duration = parseFloat(getComputedStyle($sheet[0]).transitionDuration)
        expect(duration).to.be.within(0.22, 0.28)
      })
      cy.get('[data-slot="sheet-close"]').click()
      cy.findByRole('button', 'More').should('be.focused')
    })
  })

  it('removes nonessential transition time when reduced motion is requested', () => {
    cy.viewport(375, 812)
    cy.then(() => Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setEmulatedMedia',
      params: { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
    }))
    cy.visit('/login')
    cy.findByRole('button', 'Continue in demo mode').click()
    cy.findByRole('button', 'More').click()
    cy.get('[data-slot="sheet-content"]').should(($sheet) => {
      expect(parseFloat(getComputedStyle($sheet[0]).transitionDuration)).to.be.lessThan(0.02)
    })
  })
})
