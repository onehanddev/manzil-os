import './commands'
import 'cypress-axe'

Cypress.on('window:load', (win) => {
  const style = win.document.createElement('style')
  style.dataset.testHarness = 'toast-actionability'
  style.textContent = '[data-sonner-toaster][data-y-position="top"]{top:auto!important;bottom:96px!important;z-index:9999!important}[data-sonner-toast]{--z-index:9999!important;z-index:9999!important;pointer-events:none!important}'
  win.document.head.appendChild(style)
})
