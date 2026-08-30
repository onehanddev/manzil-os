/**
 * Master Data E2E — Phase 0 Issues 1-4
 * Backend is MSW in-memory; use testids for selects to avoid hidden-tab collisions
 */
function unique(prefix: string) { return `${prefix}-${Date.now()}-${Math.floor(Math.random()*10000)}` }
function dismissToastIfVisible(){ cy.get('body').click(0,0,{force:true}); cy.wait(400) }
describe('Phase 0 — Issues 1-4 end-to-end',()=>{
  beforeEach(()=>{ cy.viewport('iphone-x') })
  describe('Issue 2 — App shell and health',()=>{
    it('loads the app shell after demo login',()=>{
      cy.loginDemo()
      cy.get('h1').contains('Dashboard').should('be.visible')
      cy.contains('Lotus Divine').should('be.visible')
      cy.contains('Fund balance').should('be.visible')
    })
  })
  describe('Issue 3 — Minimal staff auth',()=>{
    it('redirects unauthenticated user visiting /flats to /login',()=>{
      cy.clearLocalStorage(); cy.visit('/flats'); cy.url().should('include','/login'); cy.contains('Manzil OS').should('be.visible')
    })
    it('allows demo login and preserves session across navigation',()=>{
      cy.visit('/login'); cy.contains('button','Continue in demo mode').click(); cy.url().should('include','/dashboard'); cy.visit('/flats'); cy.contains('Flats & Master Data').should('be.visible'); cy.url().should('not.include','/login')
    })
    it('shows society switcher with demo society after login',()=>{
      cy.loginDemo(); cy.contains('Lotus Divine').should('be.visible')
    })
  })
  describe('Issue 4 — Flat Categories (AC1)',()=>{
    beforeEach(()=>{ cy.loginDemo(); cy.visit('/flats'); cy.contains('Flats & Master Data').should('be.visible') })
    it('creates a flat category with maintenance_amount and shows it in the list',()=>{
      const catName=unique('CAT-MAINT'); cy.contains('Create flat category').should('be.visible'); cy.get('#cat-name').type(catName); cy.get('#cat-maintenance').type('1500'); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); cy.contains(catName).should('be.visible'); cy.contains('₹1500').should('be.visible')
    })
    it('creates a category without maintenance_amount (null default)',()=>{
      const catName=unique('CAT-NODEFAULT'); cy.get('#cat-name').type(catName); cy.get('#cat-maintenance').should('have.value',''); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); cy.contains(catName).should('be.visible'); cy.contains(catName).closest('div.rounded-lg').should('contain','No default')
    })
    it('toggles category active state',()=>{
      const catName=unique('CAT-TOGGLE'); cy.get('#cat-name').type(catName); cy.get('#cat-maintenance').type('800'); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains(catName).should('be.visible'); cy.contains(catName).closest('div.rounded-lg').within(()=>{cy.contains('button','Deactivate').click()}); cy.contains('Category updated').should('be.visible'); cy.contains(catName).closest('div.rounded-lg').should('contain','Inactive'); cy.contains(catName).closest('div.rounded-lg').within(()=>{cy.contains('button','Activate').click()}); cy.contains('Category updated').should('be.visible'); cy.contains(catName).closest('div.rounded-lg').should('contain','Active')
    })
    it('rejects duplicate category name',()=>{
      const catName=unique('CAT-DUP'); cy.get('#cat-name').type(catName); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.get('#cat-name').clear().type(catName); cy.contains('button','Create').click(); cy.contains('Category name already exists').should('be.visible')
    })
  })
  describe('Issue 4 — Flats (AC2)',()=>{
    beforeEach(()=>{ cy.loginDemo(); cy.visit('/flats') })
    it('creates a flat linked to a category and lists it with maintenance default',()=>{
      const catName=unique('FLATCAT'); cy.get('#cat-name').type(catName); cy.get('#cat-maintenance').type('1800'); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); cy.contains('Create flat').should('be.visible'); const flatNo=unique('A'); cy.get('#flat-number').type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); cy.contains(flatNo).should('be.visible'); cy.contains(flatNo).closest('div.rounded-lg').should('contain','₹1800')
    })
    it('rejects duplicate flat number',()=>{
      const catName=unique('DUP-FLATCAT'); cy.get('#cat-name').type(catName); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatNo=unique('DUP'); cy.get('#flat-number').type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); cy.get('#flat-number').clear().type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat number already exists').should('be.visible')
    })
    it('flat detail shows maintenance amount from category (prefill contract)',()=>{
      const catName=unique('PREFILL-CAT'); cy.get('#cat-name').type(catName); cy.get('#cat-maintenance').type('2200'); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatNo=unique('PF'); cy.get('#flat-number').type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); cy.visit('/receipts'); cy.contains('Record maintenance receipt').should('be.visible'); cy.wait(1200); cy.get('[data-testid="receipt-flat-select"]').click({force:true}); cy.get('[data-slot="select-item"]').should('be.visible'); cy.contains('[data-slot="select-item"]',flatNo).click({force:true}); cy.get('#receipt-amount').should('have.value','2200')
    })
  })
  describe('Issue 4 — Persons / Contacts (AC3)',()=>{
    beforeEach(()=>{ cy.loginDemo(); cy.visit('/flats'); cy.contains('button','POCs').click() })
    it('creates owner and tenant contacts and lists them',()=>{
      const ownerName=unique('Owner'); const tenantName=unique('Tenant'); cy.get('input[placeholder="Full name"]').type(ownerName); cy.get('input[placeholder*="9000000011"]').type('9000011111'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); cy.contains(ownerName).should('be.visible'); cy.get('input[placeholder="Full name"]').type(tenantName); cy.get('input[placeholder*="9000000011"]').type('9000022222'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); cy.contains(tenantName).should('be.visible')
    })
  })
  describe('Issue 4 — Flat occupancy assignment (AC4)',()=>{
    it('assigns owner and tenant to a flat (tenant optional)',()=>{
      cy.loginDemo(); cy.visit('/flats'); const catName=unique('OCC-CAT'); cy.get('#cat-name').type(catName); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatNo=unique('OCC'); cy.get('#flat-number').type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','POCs').click(); const ownerName=unique('Owner'); cy.get('input[placeholder="Full name"]').type(ownerName); cy.get('input[placeholder*="9000000011"]').type('9000033333'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); const tenantName=unique('Tenant'); cy.get('input[placeholder="Full name"]').type(tenantName); cy.get('input[placeholder*="9000000011"]').type('9000044444'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); cy.contains('Assign to flat').should('be.visible'); cy.get('[data-testid="assign-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatNo).click({force:true}); cy.get('[data-testid="assign-person-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',ownerName).click({force:true}); cy.contains('button','Assign').click(); cy.contains('Assigned OWNER').should('be.visible'); dismissToastIfVisible(); cy.get('[data-testid="assign-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatNo).click({force:true}); cy.get('[data-testid="assign-person-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',tenantName).click({force:true}); cy.get('[data-testid="assign-role-select"]').click({force:true}); cy.contains('[data-slot="select-item"]','TENANT').click({force:true}); cy.contains('button','Assign').click(); cy.contains('Assigned TENANT').should('be.visible')
    })
    it('rejects double active owner for same flat',()=>{
      cy.loginDemo(); cy.visit('/flats'); const catName=unique('DOUBLE-CAT'); cy.get('#cat-name').type(catName); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatNo=unique('DBL'); cy.get('#flat-number').type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','POCs').click(); const ownerA=unique('OwnerA'); cy.get('input[placeholder="Full name"]').type(ownerA); cy.get('input[placeholder*="9000000011"]').type('9000055555'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); const ownerB=unique('OwnerB'); cy.get('input[placeholder="Full name"]').type(ownerB); cy.get('input[placeholder*="9000000011"]').type('9000066666'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); cy.get('[data-testid="assign-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatNo).click({force:true}); cy.get('[data-testid="assign-person-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',ownerA).click({force:true}); cy.contains('button','Assign').click(); cy.contains('Assigned OWNER').should('be.visible'); dismissToastIfVisible(); cy.get('[data-testid="assign-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatNo).click({force:true}); cy.get('[data-testid="assign-person-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',ownerB).click({force:true}); cy.contains('button','Assign').click(); cy.contains('Active occupant already exists').should('be.visible')
    })
  })
  describe('Issue 4 — Default payer (AC5): tenant-first, owner fallback',()=>{
    it('returns tenant when flat has tenant, owner otherwise',()=>{
      cy.loginDemo(); cy.visit('/flats'); const catName=unique('DP-CAT'); cy.get('#cat-name').type(catName); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatOwnerOnly=unique('DP-OWNER'); cy.get('#flat-number').type(flatOwnerOnly); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); const flatWithTenant=unique('DP-BOTH'); cy.get('#flat-number').clear().type(flatWithTenant); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','POCs').click(); const owner1=unique('DP-Owner1'); cy.get('input[placeholder="Full name"]').type(owner1); cy.get('input[placeholder*="9000000011"]').type('9000077777'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); const owner2=unique('DP-Owner2'); cy.get('input[placeholder="Full name"]').type(owner2); cy.get('input[placeholder*="9000000011"]').type('9000088888'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); const tenant2=unique('DP-Tenant2'); cy.get('input[placeholder="Full name"]').type(tenant2); cy.get('input[placeholder*="9000000011"]').type('9000099999'); cy.contains('button','Create contact').click(); cy.contains('Contact created').should('be.visible'); dismissToastIfVisible(); cy.get('[data-testid="assign-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatOwnerOnly).click({force:true}); cy.get('[data-testid="assign-person-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',owner1).click({force:true}); cy.contains('button','Assign').click(); cy.contains('Assigned OWNER').should('be.visible'); dismissToastIfVisible(); cy.get('[data-testid="assign-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatWithTenant).click({force:true}); cy.get('[data-testid="assign-person-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',owner2).click({force:true}); cy.contains('button','Assign').click(); cy.contains('Assigned OWNER').should('be.visible'); dismissToastIfVisible(); cy.get('[data-testid="assign-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatWithTenant).click({force:true}); cy.get('[data-testid="assign-person-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',tenant2).click({force:true}); cy.get('[data-testid="assign-role-select"]').click({force:true}); cy.contains('[data-slot="select-item"]','TENANT').click({force:true}); cy.contains('button','Assign').click(); cy.contains('Assigned TENANT').should('be.visible'); dismissToastIfVisible(); cy.contains('Default payer preview').should('be.visible'); cy.get('[data-testid="preview-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatOwnerOnly).click({force:true}); cy.get('[data-testid="preview-check-btn"]').click(); cy.contains('OWNER').should('be.visible'); cy.get('[data-testid="preview-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatWithTenant).click({force:true}); cy.get('[data-testid="preview-check-btn"]').click(); cy.contains('TENANT').should('be.visible')
    })
  })
  describe('Issue 4 — Opening Dues (AC: opening cash per flat)',()=>{
    it('sets and reads opening due for a flat',()=>{
      cy.loginDemo(); cy.visit('/flats'); const catName=unique('OD-CAT'); cy.get('#cat-name').type(catName); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatNo=unique('OD'); cy.get('#flat-number').type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Opening Dues').click(); cy.contains('Opening due (per flat)').should('be.visible'); cy.get('[data-testid="opening-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatNo).click({force:true}); cy.get('[data-testid="opening-show-btn"]').click(); cy.contains('Current opening due:').should('be.visible'); cy.get('input[placeholder="e.g. 2000"]').clear().type('2500'); cy.contains('button','Set opening due').click(); cy.contains('Opening due set to 2500').should('be.visible'); cy.contains('Current opening due:').should('contain','2500'); cy.get('[data-testid="opening-show-btn"]').click(); cy.contains('2500').should('be.visible')
    })
    it('rejects negative opening due amount',()=>{
      cy.loginDemo(); cy.visit('/flats'); const catName=unique('OD-NEG-CAT'); cy.get('#cat-name').type(catName); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatNo=unique('ODNEG'); cy.get('#flat-number').type(flatNo); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catName).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Opening Dues').click(); cy.get('[data-testid="opening-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatNo).click({force:true}); cy.get('input[placeholder="e.g. 2000"]').clear().type('-100'); cy.contains('button','Set opening due').click(); cy.contains('Amount must be >= 0').should('be.visible')
    })
  })
  describe('Issue 4 — Receipt prefill integration (maintenance_amount)',()=>{
    it('prefills receipt amount from category default, clears if no default',()=>{
      cy.loginDemo(); cy.visit('/flats'); const catWith=unique('R-CAT-WITH'); cy.get('#cat-name').type(catWith); cy.get('#cat-maintenance').type('1800'); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); const catWithout=unique('R-CAT-NONE'); cy.get('#cat-name').clear().type(catWithout); cy.get('#cat-maintenance').clear(); cy.contains('button','Create').click(); cy.contains('Category created').should('be.visible'); dismissToastIfVisible(); cy.contains('button','Flats').click(); const flatWith=unique('R-WITH'); cy.get('#flat-number').type(flatWith); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catWith).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); dismissToastIfVisible(); const flatWithout=unique('R-NONE'); cy.get('#flat-number').clear().type(flatWithout); cy.get('[data-testid="create-flat-category-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',catWithout).click({force:true}); cy.contains('button','Create flat').click(); cy.contains('Flat created').should('be.visible'); cy.visit('/receipts'); cy.contains('Record maintenance receipt').should('be.visible'); cy.wait(1200); cy.get('[data-testid="receipt-flat-select"]').click({force:true}); cy.get('[data-slot="select-item"]').should('be.visible'); cy.contains('[data-slot="select-item"]',flatWith).click({force:true}); cy.get('#receipt-amount').should('have.value','1800'); cy.get('[data-testid="receipt-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatWithout).click({force:true}); cy.get('#receipt-amount').should('have.value',''); cy.get('[data-testid="receipt-flat-select"]').click({force:true}); cy.contains('[data-slot="select-item"]',flatWith).click({force:true}); cy.get('#receipt-amount').should('have.value','1800'); cy.get('#receipt-amount').clear().type('2500'); cy.get('#receipt-amount').should('have.value','2500')
    })
  })
  describe('Issue 4 — Funds (AC6)',()=>{
    beforeEach(()=>{ cy.loginDemo(); cy.visit('/funds'); cy.contains('Funds & Master Data').should('be.visible') })
    it('lists seeded Main Fund and Sinking Fund',()=>{
      cy.contains('Main Fund').should('be.visible'); cy.contains('Sinking Fund').should('be.visible')
    })
    it('creates a fund and lists it',()=>{
      const name=unique('FUND'); cy.get('#fund-name').type(name); cy.contains('button','Create').click(); cy.contains('Fund created').should('be.visible'); cy.contains(name).should('be.visible')
    })
    it('rejects duplicate fund name',()=>{
      const name=unique('FUND-DUP'); cy.get('#fund-name').type(name); cy.contains('button','Create').click(); cy.contains('Fund created').should('be.visible'); dismissToastIfVisible(); cy.get('#fund-name').clear().type(name); cy.contains('button','Create').click(); cy.contains('Fund name already exists').should('be.visible')
    })
  })
  describe('Issue 4 — Vendors / Payees (AC7)',()=>{
    beforeEach(()=>{ cy.loginDemo(); cy.visit('/funds'); cy.contains('button','Vendors').click() })
    it('creates a vendor and lists it',()=>{
      const name=unique('VENDOR'); cy.get('#vendor-name').type(name); cy.get('#vendor-contact').type('9000001234'); cy.contains('button','Create').click(); cy.contains('Vendor created').should('be.visible'); cy.contains(name).should('be.visible')
    })
    it('rejects duplicate vendor name',()=>{
      const name=unique('VENDOR-DUP'); cy.get('#vendor-name').type(name); cy.contains('button','Create').click(); cy.contains('Vendor created').should('be.visible'); dismissToastIfVisible(); cy.get('#vendor-name').clear().type(name); cy.contains('button','Create').click(); cy.contains('Vendor name already exists').should('be.visible')
    })
  })
  describe('Issue 4 — Expense Categories (AC8)',()=>{
    beforeEach(()=>{ cy.loginDemo(); cy.visit('/funds'); cy.contains('button','Expense Categories').click() })
    it('creates an expense category and lists it',()=>{
      const name=unique('EXPCAT'); cy.get('#exp-cat-name').type(name); cy.contains('button','Create').click(); cy.contains('Expense category created').should('be.visible'); cy.contains(name).should('be.visible')
    })
    it('rejects duplicate expense category name',()=>{
      const name=unique('EXPCAT-DUP'); cy.get('#exp-cat-name').type(name); cy.contains('button','Create').click(); cy.contains('Expense category created').should('be.visible'); dismissToastIfVisible(); cy.get('#exp-cat-name').clear().type(name); cy.contains('button','Create').click(); cy.contains('Expense category name already exists').should('be.visible')
    })
    it('lists seeded categories',()=>{
      cy.contains('Electricity').should('be.visible'); cy.contains('Salary').should('be.visible')
    })
  })
  describe('Mobile-first assertions',()=>{
    it('flats page is usable on phone viewport without horizontal scroll',()=>{
      cy.loginDemo(); cy.visit('/flats'); cy.viewport('iphone-x'); cy.contains('Flats & Master Data').should('be.visible'); cy.get('body').then($b=>{ expect($b[0].scrollWidth).to.be.lte($b[0].clientWidth+5) })
    })
    it('funds page is usable on phone viewport',()=>{
      cy.loginDemo(); cy.visit('/funds'); cy.viewport('iphone-x'); cy.contains('Funds & Master Data').should('be.visible'); cy.get('body').then($b=>{ expect($b[0].scrollWidth).to.be.lte($b[0].clientWidth+5) })
    })
  })
})
