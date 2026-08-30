import { http, HttpResponse } from 'msw'
import type { MeResponse, Society } from '@/lib/api/types'

const societies: Society[] = [
  { id: 'soc-lotus-divine', name: 'Lotus Divine', location: 'Wadala', city: 'Mumbai' },
  { id: 'soc-rose-valley', name: 'Rose Valley', location: 'Andheri West', city: 'Mumbai' },
]

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

const store: {
  categories: FlatCategory[]
  flats: Flat[]
  persons: Person[]
  occupants: Occupant[]
  openingDues: Map<string, OpeningDue>
  funds: Fund[]
  vendors: Vendor[]
  expenseCategories: ExpenseCategory[]
} = {
  categories: [
    // Seed Main Fund / Sinking Fund equivalent for direct API parity with backend migration
  ],
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
}

function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`
}

export const handlers = [
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
  http.get('*/api/flats', () => {
    const flats = store.flats.map((f) => {
      const cat = store.categories.find((c) => c.id === f.flat_category_id)
      const amt = cat?.maintenance_amount ?? null
      return {
        ...f,
        maintenance_amount: amt,
        category_maintenance_amount: amt,
        flat_category: cat ? { id: cat.id, name: cat.name, maintenance_amount: amt } : null,
      }
    })
    return HttpResponse.json({ flats })
  }),
  http.get('*/api/flats/:flatId', ({ params }) => {
    const { flatId } = params as { flatId: string }
    const f = store.flats.find((x) => x.id === flatId)
    if (!f) return HttpResponse.json({ detail: 'Flat not found' }, { status: 404 })
    const cat = store.categories.find((c) => c.id === f.flat_category_id)
    const amt = cat?.maintenance_amount ?? null
    return HttpResponse.json({
      ...f,
      maintenance_amount: amt,
      category_maintenance_amount: amt,
      flat_category: cat ? { id: cat.id, name: cat.name, maintenance_amount: amt } : null,
    })
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

  // Health (proxied via /api prefix in dev, but MSW bypasses actual backend health)
  http.get('*/health', () => HttpResponse.json({ status: 'ok', db: 'ok' })),
]
