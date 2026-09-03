import { http, HttpResponse } from 'msw'
import type { MeResponse, Society } from '@/lib/api/types'

const societies: Society[] = [
  { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' },
  { id: 'soc-rose-valley', name: 'Rose Valley', location: 'Andheri West', city: 'Mumbai' },
]

let idSequence = 0

// In-memory MSW store for master data (Issue 4). Persists across requests in the
// same browser session so Cypress can exercise create → list flows end-to-end.
type FlatCategory = { id: string; society_id: string; name: string; is_active: boolean; maintenance_amount: number | null; size_sq_ft: number | null }
type Flat = { id: string; society_id: string; flat_number: string; flat_category_id: string; is_active: boolean }
type Person = { id: string; society_id: string; name: string; mobile: string; alt_mobile: string | null }
type Occupant = { id: string; flat_id: string; person_id: string; role: 'OWNER' | 'TENANT'; is_active: boolean }
type OpeningDue = { flat_id: string; amount: number }
type Fund = { id: string; society_id: string; name: string; is_active: boolean }
type Vendor = { id: string; society_id: string; name: string; contact_info: string | null; is_active: boolean }
type ExpenseCategory = { id: string; society_id: string; name: string; is_active: boolean }
type Receipt = { id: string; society_id: string; flat_id: string; amount: number; business_date: string; type: string; status: string; narration?: string | null; voided_at?: string | null; void_reason?: string | null; fund_id?: string | null; payer_person_id?: string | null }
type Expense = { id: string; society_id: string; business_date: string; amount: number; fund_id: string | null; category_id: string; vendor_id: string | null; narration: string | null; created_by: string; created_at: string }
type ReportRun = { id: string; from: string; to: string; opening: number; total_receipts: number; total_expenses: number; closing: number; generated_at: string; generated_by: string; format: 'xlsx' | 'pdf' }

type MockStore = {
  categories: FlatCategory[]
  flats: Flat[]
  persons: Person[]
  occupants: Occupant[]
  openingDues: Map<string, OpeningDue>
  funds: Fund[]
  vendors: Vendor[]
  expenseCategories: ExpenseCategory[]
  receipts: Receipt[]
  expenses: Expense[]
  cashOpenings: Map<string, number>
  reportRuns: ReportRun[]
}

function createInitialStore(): MockStore {
  return {
    categories: [],
    flats: [],
    persons: [],
    occupants: [],
    openingDues: new Map(),
    funds: [
      { id: 'fund-main', society_id: societies[0].id, name: 'Main Fund', is_active: true },
      { id: 'fund-sinking', society_id: societies[0].id, name: 'Sinking Fund', is_active: true },
    ],
    vendors: [],
    expenseCategories: [
      { id: 'exp-cat-electricity', society_id: societies[0].id, name: 'Electricity', is_active: true },
      { id: 'exp-cat-salary', society_id: societies[0].id, name: 'Salary', is_active: true },
      { id: 'exp-cat-cleaning', society_id: societies[0].id, name: 'Cleaning', is_active: true },
      { id: 'exp-cat-lift', society_id: societies[0].id, name: 'Lift', is_active: true },
      { id: 'exp-cat-repair', society_id: societies[0].id, name: 'Repair', is_active: true },
    ],
    receipts: [],
    expenses: [],
    cashOpenings: new Map(),
    reportRuns: [],
  }
}

const store = createInitialStore()

export function resetMockData() {
  const fresh = createInitialStore()
  store.categories = fresh.categories
  store.flats = fresh.flats
  store.persons = fresh.persons
  store.occupants = fresh.occupants
  store.openingDues = fresh.openingDues
  store.funds = fresh.funds
  store.vendors = fresh.vendors
  store.expenseCategories = fresh.expenseCategories
  store.receipts = fresh.receipts
  store.expenses = fresh.expenses
  store.cashOpenings = fresh.cashOpenings
  store.reportRuns = fresh.reportRuns
  idSequence = 0
}

function genId(prefix: string) {
  idSequence += 1
  return `${prefix}-${idSequence.toString().padStart(4, '0')}`
}

function enrichFlat(f: Flat) {
  const cat = store.categories.find((c) => c.id === f.flat_category_id)
  const amt = cat?.maintenance_amount ?? null
  const activeOccs = store.occupants.filter((o) => o.flat_id === f.id && o.is_active)
  const ownerOcc = activeOccs.find((o) => o.role === 'OWNER')
  const tenantOcc = activeOccs.find((o) => o.role === 'TENANT')
  const ownerPerson = ownerOcc ? store.persons.find((p) => p.id === ownerOcc.person_id) : null
  const tenantPerson = tenantOcc ? store.persons.find((p) => p.id === tenantOcc.person_id) : null
  const owner = ownerPerson ? { id: ownerPerson.id, name: ownerPerson.name, mobile: ownerPerson.mobile, email: null } : null
  const tenant = tenantPerson ? { id: tenantPerson.id, name: tenantPerson.name, mobile: tenantPerson.mobile, email: null } : null
  const defaultRole = tenant ? 'TENANT' : owner ? 'OWNER' : null
  const defaultPerson = tenantPerson || ownerPerson
  const default_payer = defaultPerson ? { person: { id: defaultPerson.id, name: defaultPerson.name, mobile: defaultPerson.mobile }, role: defaultRole } : null
  const occupants = activeOccs.map((o) => {
    const person = store.persons.find((p) => p.id === o.person_id)
    return { occupant_id: o.id, person: person ? { id: person.id, name: person.name, mobile: person.mobile } : null, role: o.role, is_active: o.is_active }
  })
  return {
    ...f,
    maintenance_amount: amt,
    category_maintenance_amount: amt,
    flat_category: cat ? { id: cat.id, name: cat.name, maintenance_amount: amt } : null,
    owner,
    tenant,
    occupants,
    default_payer,
    default_payer_person_id: defaultPerson?.id ?? null,
    default_payer_role: defaultRole,
  }
}

export const handlers = [
  http.post('*/__mock/reset', () => {
    resetMockData()
    return HttpResponse.json({ ok: true })
  }),
  http.get('*/api/me', () =>
    HttpResponse.json<MeResponse>({
      user: { id: 'user-dev', display_name: 'Dev User', mobile: '+91 99999 99999' },
      memberships: [
        {
          society: societies[0],
          roles: ['super_admin', 'resident'],
          permissions: ['*'],
        },
        {
          society: societies[1],
          roles: ['committee_member'],
          permissions: ['receipt:create', 'expense:create', 'report:view'],
        },
      ],
      platform_admin: true,
    }),
  ),
  http.get('*/api/societies', () => HttpResponse.json<Society[]>(societies)),

  // ---- Flat Categories ----
  http.get('*/api/flat-categories', () => {
    return HttpResponse.json({ categories: store.categories, flat_categories: store.categories })
  }),
  http.post('*/api/flat-categories', async ({ request }) => {
    const body = (await request.json()) as { name?: string; maintenance_amount?: number | null; size_sq_ft?: number | null }
    const name = (body.name ?? '').trim()
    if (!name) return HttpResponse.json({ detail: 'Name required' }, { status: 422 })
    if (body.maintenance_amount != null && body.maintenance_amount < 0)
      return HttpResponse.json({ detail: 'maintenance_amount must be >= 0' }, { status: 422 })
    if (store.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return HttpResponse.json({ detail: 'Category name already exists' }, { status: 409 })
    }
    const cat: FlatCategory = {
      id: genId('cat'),
      society_id: societies[0].id,
      name,
      is_active: true,
      maintenance_amount: body.maintenance_amount ?? null,
      size_sq_ft: body.size_sq_ft ?? null,
    }
    store.categories.push(cat)
    return HttpResponse.json(cat, { status: 201 })
  }),
  http.patch('*/api/flat-categories/:catId', async ({ params, request }) => {
    const { catId } = params as { catId: string }
    const body = (await request.json()) as { is_active?: boolean; maintenance_amount?: number | null }
    const cat = store.categories.find((c) => c.id === catId)
    if (!cat) return HttpResponse.json({ detail: 'Category not found' }, { status: 404 })
    if (body.maintenance_amount !== undefined) {
      if (body.maintenance_amount != null && body.maintenance_amount < 0)
        return HttpResponse.json({ detail: 'maintenance_amount must be >= 0' }, { status: 422 })
      cat.maintenance_amount = body.maintenance_amount ?? null
    }
    if (body.is_active !== undefined) cat.is_active = body.is_active
    const resp = { ...cat, category: { id: cat.id, is_active: cat.is_active, maintenance_amount: cat.maintenance_amount } }
    return HttpResponse.json(resp)
  }),

  // ---- Flats ----
  http.get('*/api/flats', ({ request }) => {
    const url = new URL(request.url)
    const withDues = url.searchParams.get('with_dues') === 'true'
    let flats = store.flats.map((f) => enrichFlat(f))
    if (withDues) {
      flats = flats.map((fl) => {
        const opening = store.openingDues.get(fl.id)?.amount ?? 0
        const totalPaid = store.receipts.filter((r) => r.flat_id === fl.id && r.status !== 'VOIDED').reduce((s, r) => s + r.amount, 0)
        return { ...fl, opening_due: opening, total_paid: totalPaid, current_due: opening - totalPaid }
      })
    }
    return HttpResponse.json({ flats })
  }),
  http.get('*/api/flats/:flatId/ledger', ({ params }) => {
    const { flatId } = params as { flatId: string }
    const flat = store.flats.find((f) => f.id === flatId)
    if (!flat) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    const opening = store.openingDues.get(flatId)?.amount ?? 0
    const receipts = store.receipts.filter((r) => r.flat_id === flatId && r.status !== 'VOIDED').sort((a, b) => a.business_date.localeCompare(b.business_date))
    const totalPaid = receipts.reduce((s, r) => s + r.amount, 0)
    const current_due = opening - totalPaid
    const entries: unknown[] = [{ type: 'OPENING', business_date: null, amount: opening, narration: 'Opening due', running_due: opening, current_due: opening }]
    let running = opening
    for (const r of receipts) {
      running -= r.amount
      entries.push({ id: r.id, type: r.type, business_date: r.business_date, amount: r.amount, narration: null, running_due: running, current_due: running })
    }
    return HttpResponse.json({ flat_id: flatId, flat_number: flat.flat_number, opening_due: opening, opening, total_paid: totalPaid, current_due, entries, ledger: entries, rows: entries, receipts })
  }),
  http.get('*/api/flats/:flatId', ({ params }) => {
    const { flatId } = params as { flatId: string }
    const f = store.flats.find((x) => x.id === flatId)
    if (!f) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    return HttpResponse.json(enrichFlat(f))
  }),
  http.get('*/api/flats/:flatId/occupants', ({ params }) => {
    const { flatId } = params as { flatId: string }
    const flat = store.flats.find((f) => f.id === flatId)
    if (!flat) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    const enriched = enrichFlat(flat)
    return HttpResponse.json({ flat_id: flatId, occupants: enriched.occupants, owner: enriched.owner, tenant: enriched.tenant, default_payer: enriched.default_payer })
  }),
  http.post('*/api/flats', async ({ request }) => {
    const body = (await request.json()) as { flat_number?: string; flat_category_id?: string }
    const flat_number = (body.flat_number ?? '').trim()
    const flat_category_id = body.flat_category_id ?? ''
    if (!flat_number) return HttpResponse.json({ detail: 'flat_number required' }, { status: 422 })
    if (!flat_category_id) return HttpResponse.json({ detail: 'flat_category_id required' }, { status: 422 })
    if (!store.categories.some((c) => c.id === flat_category_id))
      return HttpResponse.json({ detail: 'Invalid flat_category_id' }, { status: 422 })
    if (store.flats.some((f) => f.flat_number.toLowerCase() === flat_number.toLowerCase())) {
      return HttpResponse.json({ detail: 'Flat number already exists' }, { status: 409 })
    }
    const flat: Flat = {
      id: genId('flat'),
      society_id: societies[0].id,
      flat_number,
      flat_category_id,
      is_active: true,
    }
    store.flats.push(flat)
    const cat = store.categories.find((c) => c.id === flat_category_id)
    const amt = cat?.maintenance_amount ?? null
    return HttpResponse.json(
      { id: flat.id, society_id: flat.society_id, flat_number: flat.flat_number, flat_category_id: flat.flat_category_id, is_active: flat.is_active, flat: { id: flat.id, flat_number: flat.flat_number }, maintenance_amount: amt },
      { status: 201 },
    )
  }),

  // ---- Persons ----
  http.get('*/api/persons', () => HttpResponse.json({ persons: store.persons })),
  http.post('*/api/persons', async ({ request }) => {
    const body = (await request.json()) as { name?: string; mobile?: string; alt_mobile?: string }
    const name = (body.name ?? '').trim()
    const mobile = (body.mobile ?? '').trim()
    if (!name) return HttpResponse.json({ detail: 'Name required' }, { status: 422 })
    if (!mobile) return HttpResponse.json({ detail: 'Mobile required' }, { status: 422 })
    const person: Person = {
      id: genId('person'),
      society_id: societies[0].id,
      name,
      mobile,
      alt_mobile: body.alt_mobile ?? null,
    }
    store.persons.push(person)
    return HttpResponse.json({ id: person.id, society_id: person.society_id, name: person.name, mobile: person.mobile, alt_mobile: person.alt_mobile, person: { id: person.id, name: person.name, mobile: person.mobile } }, { status: 201 })
  }),

  // ---- Occupants ----
  http.post('*/api/flats/:flatId/occupants', async ({ params, request }) => {
    const { flatId } = params as { flatId: string }
    const body = (await request.json()) as { person_id?: string; role?: string; is_active?: boolean }
    const flat = store.flats.find((f) => f.id === flatId)
    if (!flat) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    const person = store.persons.find((p) => p.id === body.person_id)
    if (!person) return HttpResponse.json({ detail: 'Person not found' }, { status: 404 })
    const role = (body.role ?? '').toUpperCase()
    if (role !== 'OWNER' && role !== 'TENANT') return HttpResponse.json({ detail: 'Role must be OWNER or TENANT' }, { status: 422 })
    const is_active = body.is_active ?? true
    if (is_active && store.occupants.some((o) => o.flat_id === flatId && o.role === role && o.is_active)) {
      return HttpResponse.json({ detail: 'Active occupant already exists for this role' }, { status: 409 })
    }
    if (store.occupants.some((o) => o.flat_id === flatId && o.person_id === body.person_id && o.role === role)) {
      return HttpResponse.json({ detail: 'Occupant already assigned' }, { status: 409 })
    }
    const occ: Occupant = { id: genId('occ'), flat_id: flatId, person_id: body.person_id!, role: role as 'OWNER' | 'TENANT', is_active }
    store.occupants.push(occ)
    return HttpResponse.json({ id: occ.id, flat_id: occ.flat_id, person_id: occ.person_id, role: occ.role, is_active: occ.is_active }, { status: 201 })
  }),
  http.get('*/api/flats/:flatId/default-payer', ({ params }) => {
    const { flatId } = params as { flatId: string }
    const flat = store.flats.find((f) => f.id === flatId)
    if (!flat) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    const tenant = store.occupants.find((o) => o.flat_id === flatId && o.role === 'TENANT' && o.is_active)
    if (tenant) {
      const person = store.persons.find((p) => p.id === tenant.person_id)
      return HttpResponse.json({ person_id: tenant.person_id, role: 'TENANT', default_payer: { id: tenant.person_id, name: person?.name ?? null, mobile: person?.mobile ?? null } })
    }
    const owner = store.occupants.find((o) => o.flat_id === flatId && o.role === 'OWNER' && o.is_active)
    if (owner) {
      const person = store.persons.find((p) => p.id === owner.person_id)
      return HttpResponse.json({ person_id: owner.person_id, role: 'OWNER', default_payer: { id: owner.person_id, name: person?.name ?? null, mobile: person?.mobile ?? null } })
    }
    return HttpResponse.json({ detail: 'No active occupant found' }, { status: 404 })
  }),

  // ---- Opening Dues ----
  http.put('*/api/flats/:flatId/opening-due', async ({ params, request }) => {
    const { flatId } = params as { flatId: string }
    const body = (await request.json()) as { amount?: number }
    if (body.amount == null || body.amount < 0) return HttpResponse.json({ detail: 'Amount must be >= 0' }, { status: 422 })
    const flat = store.flats.find((f) => f.id === flatId)
    if (!flat) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    store.openingDues.set(flatId, { flat_id: flatId, amount: body.amount })
    return HttpResponse.json({ flat_id: flatId, amount: body.amount, opening_due: { flat_id: flatId, amount: body.amount } })
  }),
  http.get('*/api/flats/:flatId/opening-due', ({ params }) => {
    const { flatId } = params as { flatId: string }
    const flat = store.flats.find((f) => f.id === flatId)
    if (!flat) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    const row = store.openingDues.get(flatId)
    if (!row) return HttpResponse.json({ flat_id: flatId, amount: 0, opening_due: { flat_id: flatId, amount: 0 } })
    return HttpResponse.json({ flat_id: row.flat_id, amount: row.amount, opening_due: { flat_id: row.flat_id, amount: row.amount } })
  }),

  // ---- Funds ----
  http.get('*/api/funds', () => HttpResponse.json({ funds: store.funds })),
  http.post('*/api/funds', async ({ request }) => {
    const body = (await request.json()) as { name?: string }
    const name = (body.name ?? '').trim()
    if (!name) return HttpResponse.json({ detail: 'Name required' }, { status: 422 })
    if (store.funds.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      return HttpResponse.json({ detail: 'Fund name already exists' }, { status: 409 })
    }
    const fund: Fund = { id: genId('fund'), society_id: societies[0].id, name, is_active: true }
    store.funds.push(fund)
    return HttpResponse.json(fund, { status: 201 })
  }),
  // ---- Vendors ----
  http.get('*/api/vendors', () => HttpResponse.json({ vendors: store.vendors })),
  http.post('*/api/vendors', async ({ request }) => {
    const body = (await request.json()) as { name?: string; contact_info?: string }
    const name = (body.name ?? '').trim()
    if (!name) return HttpResponse.json({ detail: 'Name required' }, { status: 422 })
    if (store.vendors.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      return HttpResponse.json({ detail: 'Vendor name already exists' }, { status: 409 })
    }
    const vendor: Vendor = {
      id: genId('vendor'),
      society_id: societies[0].id,
      name,
      contact_info: body.contact_info?.trim() || null,
      is_active: true,
    }
    store.vendors.push(vendor)
    return HttpResponse.json(vendor, { status: 201 })
  }),
  // ---- Expense Categories ----
  http.get('*/api/expense-categories', () => HttpResponse.json({ categories: store.expenseCategories, expense_categories: store.expenseCategories })),
  http.post('*/api/expense-categories', async ({ request }) => {
    const body = (await request.json()) as { name?: string }
    const name = (body.name ?? '').trim()
    if (!name) return HttpResponse.json({ detail: 'Name required' }, { status: 422 })
    if (store.expenseCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return HttpResponse.json({ detail: 'Expense category name already exists' }, { status: 409 })
    }
    const cat: ExpenseCategory = { id: genId('expcat'), society_id: societies[0].id, name, is_active: true }
    store.expenseCategories.push(cat)
    return HttpResponse.json(cat, { status: 201 })
  }),

  // ---- Expenses (cash-only) ----
  http.get('*/api/expenses', ({ request }) => {
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const cat = url.searchParams.get('category_id')
    const ven = url.searchParams.get('vendor_id')
    const fund = url.searchParams.get('fund_id')
    let list = [...store.expenses]
    if (from) list = list.filter((e) => e.business_date >= from)
    if (to) list = list.filter((e) => e.business_date <= to)
    if (cat) list = list.filter((e) => e.category_id === cat)
    if (ven) list = list.filter((e) => e.vendor_id === ven)
    if (fund) list = list.filter((e) => e.fund_id === fund)
    return HttpResponse.json({ expenses: list })
  }),
  http.post('*/api/expenses', async ({ request }) => {
    const body = (await request.json()) as { business_date?: string; amount?: number; fund_id?: string; category_id?: string; vendor_name?: string; vendor_id?: string; narration?: string; payment_method?: string }
    if (body.payment_method && body.payment_method.toUpperCase() !== 'CASH') return HttpResponse.json({ detail: 'payment_method must be CASH' }, { status: 422 })
    if (!body.business_date || body.amount == null || !body.fund_id || !body.category_id) return HttpResponse.json({ detail: 'business_date, amount, fund_id, category_id required' }, { status: 422 })
    if (body.amount <= 0) return HttpResponse.json({ detail: 'amount must be > 0' }, { status: 422 })
    let vendorId: string | null = (body.vendor_id as string) ?? null
    const vname = (body.vendor_name ?? '').trim()
    if (!vendorId && vname) {
      const existing = store.vendors.find((v) => v.name.toLowerCase() === vname.toLowerCase())
      if (existing) vendorId = existing.id
      else {
        const nv: Vendor = { id: genId('vendor'), society_id: societies[0].id, name: vname, contact_info: null, is_active: true }
        store.vendors.push(nv)
        vendorId = nv.id
      }
    }
    const expense: Expense = {
      id: genId('exp'),
      society_id: societies[0].id,
      business_date: body.business_date,
      amount: body.amount,
      fund_id: body.fund_id,
      category_id: body.category_id,
      vendor_id: vendorId,
      narration: (body.narration ?? '').trim() || null,
      created_by: 'membership-1',
      created_at: new Date().toISOString(),
    }
    store.expenses.push(expense)
    return HttpResponse.json(expense, { status: 201 })
  }),

  // ---- Receipts (directly POSTED, undo via void with history) ----
  http.get('*/api/receipts', ({ request }) => {
    const url = new URL(request.url)
    const includeVoided = url.searchParams.get('include_voided') === 'true'
    const flatId = url.searchParams.get('flat_id')
    const from = url.searchParams.get('from') ?? url.searchParams.get('date_from')
    const to = url.searchParams.get('to') ?? url.searchParams.get('date_to')
    const collector = url.searchParams.get('collected_by') ?? url.searchParams.get('collector_id')
    let list = includeVoided ? store.receipts : store.receipts.filter((r) => r.status !== 'VOIDED')
    if (flatId) list = list.filter((r) => r.flat_id === flatId)
    if (from) list = list.filter((r) => r.business_date >= from)
    if (to) list = list.filter((r) => r.business_date <= to)
    if (collector) list = list.filter((r) => (r as unknown as Record<string, unknown>).collected_by === collector || (r as unknown as Record<string, unknown>).collected_by === collector)
    // collected_by not stored in mock receipts; fallback: ignore if not present – but filter still applied via flat_id etc for test
    return HttpResponse.json({ receipts: list })
  }),
  http.get('*/api/reports/flat-dues.xlsx', () => {
    // Return a minimal placeholder – frontend download test not covering this in unit tests
    return HttpResponse.json({ detail: 'Not mocked' }, { status: 200 })
  }),
  http.get('*/reports/flat-dues.xlsx', () => {
    return HttpResponse.json({ detail: 'Not mocked' }, { status: 200 })
  }),
  http.get('*/api/receipts/:receiptId', ({ params }) => {
    const { receiptId } = params as { receiptId: string }
    const r = store.receipts.find((x) => x.id === receiptId)
    if (!r) return HttpResponse.json({ detail: 'Receipt not found' }, { status: 404 })
    return HttpResponse.json(r)
  }),
  http.post('*/api/receipts', async ({ request }) => {
    const body = (await request.json()) as { flat_id?: string; amount?: number; business_date?: string; fund_id?: string; payer_person_id?: string; type?: string; narration?: string; payment_method?: string }
    if (!body.flat_id || body.amount == null || !body.business_date || !body.fund_id) return HttpResponse.json({ detail: 'flat_id, amount, business_date, fund_id required' }, { status: 422 })
    if (body.amount <= 0) return HttpResponse.json({ detail: 'amount must be > 0' }, { status: 422 })
    if (body.payment_method && body.payment_method.toUpperCase() !== 'CASH') return HttpResponse.json({ detail: 'payment_method must be CASH' }, { status: 422 })
    const receipt: Receipt = {
      id: genId('receipt'),
      society_id: societies[0].id,
      flat_id: body.flat_id,
      amount: body.amount,
      business_date: body.business_date,
      type: (body.type ?? 'REGULAR').toUpperCase(),
      status: 'POSTED',
      narration: (body.narration ?? '').trim() || null,
      voided_at: null,
      void_reason: null,
      fund_id: body.fund_id,
      payer_person_id: body.payer_person_id ?? null,
    }
    store.receipts.push(receipt)
    return HttpResponse.json({ ...receipt, payment_method: 'CASH' }, { status: 201 })
  }),
  http.post('*/api/receipts/:receiptId/void', async ({ params, request }) => {
    const { receiptId } = params as { receiptId: string }
    const r = store.receipts.find((x) => x.id === receiptId)
    if (!r) return HttpResponse.json({ detail: 'Receipt not found' }, { status: 404 })
    if (r.status === 'VOIDED') return HttpResponse.json({ detail: 'Receipt already voided' }, { status: 409 })
    const body = (await request.json().catch(() => ({}))) as { reason?: string }
    r.status = 'VOIDED'
    r.voided_at = new Date().toISOString()
    r.void_reason = body.reason ?? null
    return HttpResponse.json(r)
  }),
  http.get('*/api/expenses/:expenseId', ({ params }) => {
    const expense = store.expenses.find((row) => row.id === params.expenseId)
    return expense ? HttpResponse.json(expense) : HttpResponse.json({ detail: 'Expense not found' }, { status: 404 })
  }),
  http.post('*/api/receipts/:receiptId/undo', async ({ params, request }) => {
    const { receiptId } = params as { receiptId: string }
    const r = store.receipts.find((x) => x.id === receiptId)
    if (!r) return HttpResponse.json({ detail: 'Receipt not found' }, { status: 404 })
    if (r.status === 'VOIDED') return HttpResponse.json({ detail: 'Receipt already voided' }, { status: 409 })
    const body = (await request.json().catch(() => ({}))) as { reason?: string }
    r.status = 'VOIDED'
    r.voided_at = new Date().toISOString()
    r.void_reason = body.reason ?? 'Undo'
    return HttpResponse.json(r)
  }),
  http.get('*/api/notifications', () => {
    // In MSW, notifications are derived from receipts for test parity
    const notifs = store.receipts
      .filter((r) => r.status !== 'VOIDED')
      .slice(-10)
      .map((r) => ({
        id: `notif-${r.id}`,
        society_id: r.society_id,
        receipt_id: r.id,
        payer_person_id: r.payer_person_id,
        flat_id: r.flat_id,
        channel: 'WHATSAPP',
        provider_mode: 'test',
        status: 'LOGGED',
        message: `[test] receipt ${r.id}`,
        business_date: r.business_date,
        created_at: new Date().toISOString(),
      }))
    return HttpResponse.json({ notifications: notifs })
  }),
  http.get('*/api/admin/pending', () => HttpResponse.json({ pending: [] })),
  http.post('*/api/admin/users/:userId/approve', ({ params }) => {
    return HttpResponse.json({ status: 'active', user_id: params.userId, role: 'COLLECTOR' })
  }),

  // ---- Cash opening balance + report (T2) ----
  http.get('*/api/cash-opening-balance', ({ request }) => {
    const url = new URL(request.url)
    const d = url.searchParams.get('date')
    if (!d) {
      if (store.cashOpenings.size === 0) return HttpResponse.json({ society_id: societies[0].id, opening_date: null, amount: 0, exists: false })
      const latest = [...store.cashOpenings.entries()].sort((a, b) => b[0].localeCompare(a[0]))[0]
      return HttpResponse.json({ society_id: societies[0].id, opening_date: latest[0], amount: latest[1], exists: true })
    }
    const exists = store.cashOpenings.has(d)
    const amt = store.cashOpenings.get(d) ?? 0
    return HttpResponse.json({ society_id: societies[0].id, opening_date: d, amount: amt, exists })
  }),
  http.put('*/api/cash-opening-balance', async ({ request }) => {
    const body = (await request.json()) as { opening_date?: string; amount?: number }
    if (!body.opening_date || body.amount == null || Number(body.amount) < 0) return HttpResponse.json({ detail: 'amount must be >= 0' }, { status: 422 })
    store.cashOpenings.set(body.opening_date, Number(body.amount))
    return HttpResponse.json({ society_id: societies[0].id, opening_date: body.opening_date, amount: Number(body.amount), exists: true })
  }),
  http.get('*/api/reports/cashbook', ({ request }) => {
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    if (!from || !to) return HttpResponse.json({ detail: 'from and to required' }, { status: 422 })
    if (from > to) return HttpResponse.json({ detail: 'from must be <= to' }, { status: 400 })
    const opening = store.cashOpenings.get(from) ?? 0
    const receipts = store.receipts.filter((r) => r.status !== 'VOIDED' && r.business_date >= from && r.business_date <= to).sort((a, b) => a.business_date.localeCompare(b.business_date)).map((receipt) => ({
      ...receipt,
      flat: { id: receipt.flat_id, flat_number: store.flats.find((flat) => flat.id === receipt.flat_id)?.flat_number ?? receipt.flat_id },
      fund: receipt.fund_id ? { id: receipt.fund_id, name: store.funds.find((fund) => fund.id === receipt.fund_id)?.name ?? receipt.fund_id } : null,
    }))
    const expenses = store.expenses.filter((e) => e.business_date >= from && e.business_date <= to).sort((a, b) => a.business_date.localeCompare(b.business_date)).map((expense) => ({
      ...expense,
      category: { id: expense.category_id, name: store.expenseCategories.find((category) => category.id === expense.category_id)?.name ?? expense.category_id },
      vendor: expense.vendor_id ? { id: expense.vendor_id, name: store.vendors.find((vendor) => vendor.id === expense.vendor_id)?.name ?? expense.vendor_id } : null,
      fund: expense.fund_id ? { id: expense.fund_id, name: store.funds.find((fund) => fund.id === expense.fund_id)?.name ?? expense.fund_id } : null,
    }))
    const totalReceipts = receipts.reduce((s, r) => s + r.amount, 0)
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
    const closing = opening + totalReceipts - totalExpenses
    const format = url.searchParams.get('format')
    if (format === 'xlsx' || format === 'pdf') {
      const run = {
        id: genId('report-run'),
        from,
        to,
        opening,
        total_receipts: totalReceipts,
        total_expenses: totalExpenses,
        closing,
        generated_at: new Date().toISOString(),
        generated_by: 'mock-admin-membership',
        format,
      } as ReportRun
      const existing = store.reportRuns.findIndex((saved) => saved.from === from && saved.to === to)
      if (existing >= 0) store.reportRuns[existing] = run
      else store.reportRuns.unshift(run)
      return new HttpResponse(format === 'pdf' ? '%PDF-mock' : 'mock-xlsx', {
        headers: {
          'Content-Disposition': `attachment; filename=cashbook-report.${format}`,
          'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })
    }
    return HttpResponse.json({
      society: { id: societies[0].id, name: societies[0].name },
      from,
      to,
      opening,
      total_receipts: totalReceipts,
      total_expenses: totalExpenses,
      closing,
      receipts,
      expenses,
    })
  }),
  http.get('*/api/reports/history', ({ request }) => {
    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page') ?? 1))
    return HttpResponse.json({ runs: store.reportRuns.slice((page - 1) * 10, page * 10), page, page_size: 10, total: store.reportRuns.length })
  }),

  // Health (proxied via /api prefix in dev, but MSW bypasses actual backend health)
  http.get('*/health', () => HttpResponse.json({ status: 'ok', db: 'ok' })),
]
