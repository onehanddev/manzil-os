import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type FlatCategory = { id: string; name: string; is_active: boolean; size_sq_ft?: number | null; maintenance_amount?: number | null }
type Flat = {
  id: string
  flat_number: string
  flat_category_id: string
  is_active: boolean
  maintenance_amount?: number | null
  category_maintenance_amount?: number | null
  flat_category?: { id: string; name: string; maintenance_amount?: number | null } | null
}
type Person = { id: string; name: string; mobile: string; alt_mobile?: string | null }

function useCategories() {
  return useQuery({
    queryKey: ['flat-categories'],
    queryFn: () => api.get<{ categories: FlatCategory[] }>('/flat-categories'),
  })
}

function useFlats() {
  return useQuery({
    queryKey: ['flats'],
    queryFn: () => api.get<{ flats: Flat[] }>('/flats'),
  })
}

function usePersons() {
  return useQuery({
    queryKey: ['persons'],
    queryFn: () => api.get<{ persons: Person[] }>('/persons'),
  })
}

export function FlatsPage() {
  const qc = useQueryClient()
  const { data: catData, isLoading: catLoading, error: catError } = useCategories()
  const { data: flatData, isLoading: flatLoading } = useFlats()
  const { data: personData } = usePersons()

  const categories = catData?.categories ?? []
  const flats = flatData?.flats ?? []
  const persons = personData?.persons ?? []

  // category form
  const [catName, setCatName] = useState('')
  const [catMaintenanceAmount, setCatMaintenanceAmount] = useState('')
  const createCat = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { name: catName }
      const trimmed = catMaintenanceAmount.trim()
      if (trimmed !== '') {
        const num = Number(trimmed)
        if (!Number.isNaN(num)) payload.maintenance_amount = num
      }
      return api.post<FlatCategory>('/flat-categories', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flat-categories'] })
      setCatName('')
      setCatMaintenanceAmount('')
      toast.success('Category created')
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? e.message : 'Failed to create category'
      toast.error(msg)
    },
  })

  const toggleCat = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch<FlatCategory>(`/flat-categories/${id}`, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flat-categories'] })
      toast.success('Category updated')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  })

  // flat form
  const [flatNumber, setFlatNumber] = useState('')
  const [flatCatId, setFlatCatId] = useState('')
  const createFlat = useMutation({
    mutationFn: () => api.post<Flat>('/flats', { flat_number: flatNumber, flat_category_id: flatCatId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flats'] })
      setFlatNumber('')
      setFlatCatId('')
      toast.success('Flat created')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to create flat'),
  })

  // person form
  const [personName, setPersonName] = useState('')
  const [personMobile, setPersonMobile] = useState('')
  const [personAlt, setPersonAlt] = useState('')
  const createPerson = useMutation({
    mutationFn: () => api.post<Person>('/persons', { name: personName, mobile: personMobile, alt_mobile: personAlt || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['persons'] })
      setPersonName('')
      setPersonMobile('')
      setPersonAlt('')
      toast.success('Contact created')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  })

  // occupant assignment
  const [occFlatId, setOccFlatId] = useState('')
  const [occPersonId, setOccPersonId] = useState('')
  const [occRole, setOccRole] = useState<'OWNER' | 'TENANT'>('OWNER')
  const assignOcc = useMutation({
    mutationFn: () => api.post(`/flats/${occFlatId}/occupants`, { person_id: occPersonId, role: occRole }),
    onSuccess: () => toast.success(`Assigned ${occRole}`),
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to assign'),
  })

  // opening due
  const [odFlatId, setOdFlatId] = useState('')
  const [odAmount, setOdAmount] = useState('')
  const [odCurrent, setOdCurrent] = useState<number | null>(null)
  const fetchOd = async () => {
    if (!odFlatId) return
    try {
      const res = await api.get<{ amount: number }>(`/flats/${odFlatId}/opening-due`)
      setOdCurrent(res.amount)
    } catch {
      setOdCurrent(null)
    }
  }
  const putOd = useMutation({
    mutationFn: () => api.put<{ amount: number }>(`/flats/${odFlatId}/opening-due`, { amount: Number(odAmount) }),
    onSuccess: (data) => {
      setOdCurrent(data.amount)
      toast.success(`Opening due set to ${data.amount}`)
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  })

  // default payer preview
  const [dpFlatId, setDpFlatId] = useState('')
  const [dpResult, setDpResult] = useState<string | null>(null)
  const fetchDp = async () => {
    if (!dpFlatId) return
    try {
      const res = await api.get<{ person_id: string; role: string }>(`/flats/${dpFlatId}/default-payer`)
      setDpResult(`${res.role}: ${res.person_id}`)
    } catch (e) {
      setDpResult(e instanceof ApiError ? e.message : 'Not found')
    }
  }

  if (catError instanceof ApiError && catError.status === 403) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-muted-foreground">Collector access is restricted. Master data is admin-only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Flats &amp; Master Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">Categories, flats, contacts, and opening dues — mobile-first.</p>
      </div>

      <Tabs defaultValue="categories">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="flats">Flats</TabsTrigger>
          <TabsTrigger value="persons">POCs</TabsTrigger>
          <TabsTrigger value="opening">Opening Dues</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Create flat category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="cat-name">Category name</Label>
                <Input id="cat-name" placeholder="e.g. 3 BHK" value={catName} onChange={(e) => setCatName(e.target.value)} className="flex-1" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cat-maintenance">Maintenance amount</Label>
                <Input
                  id="cat-maintenance"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 1500 (leave empty for no default)"
                  value={catMaintenanceAmount}
                  onChange={(e) => setCatMaintenanceAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Optional default used to prefill receipt amount. Leave empty if no default.</p>
              </div>
              <Button onClick={() => createCat.mutate()} disabled={!catName.trim() || createCat.isPending} className="w-full">
                {createCat.isPending ? '…' : 'Create'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Categories</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {catLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No categories yet.</p>
              ) : (
                categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.is_active ? 'Active' : 'Inactive'} ·{' '}
                        {c.maintenance_amount != null ? `₹${c.maintenance_amount} default` : 'No default'}
                      </div>
                      {c.maintenance_amount != null && <div className="text-xs font-medium">{c.maintenance_amount}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {c.maintenance_amount != null && <span className="text-xs">₹{c.maintenance_amount}</span>}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleCat.mutate({ id: c.id, is_active: !c.is_active })}
                      >
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flats" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Create flat</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label htmlFor="flat-number">Flat number</Label>
                  <Input id="flat-number" placeholder="e.g. A-101" value={flatNumber} onChange={(e) => setFlatNumber(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={flatCatId} onValueChange={(v) => setFlatCatId(v ?? '')}>
                    <SelectTrigger data-testid="create-flat-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.maintenance_amount != null ? `(₹${c.maintenance_amount})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => createFlat.mutate()} disabled={!flatNumber.trim() || !flatCatId || createFlat.isPending} className="w-full">
                {createFlat.isPending ? 'Creating…' : 'Create flat'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Flats</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {flatLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : flats.length === 0 ? <p className="text-sm text-muted-foreground">No flats yet.</p> : flats.map((f) => {
                const mAmt = f.maintenance_amount ?? f.category_maintenance_amount ?? f.flat_category?.maintenance_amount
                return (
                  <div key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{f.flat_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.is_active ? 'Active' : 'Inactive'} · {f.id.slice(0, 8)}
                        {mAmt != null ? ` · ₹${mAmt} default` : ' · No default'}
                      </div>
                      {mAmt != null && <div className="text-xs">₹{mAmt}</div>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setOccFlatId(f.id); setDpFlatId(f.id); setOdFlatId(f.id); fetchOd(); }}>
                      Select
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persons" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Create owner / tenant contact (POC)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input placeholder="Full name" value={personName} onChange={(e) => setPersonName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Mobile (E.164)</Label>
                <Input placeholder="9000000011 or +919000000011" value={personMobile} onChange={(e) => setPersonMobile(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Alt mobile (optional)</Label>
                <Input placeholder="Optional" value={personAlt} onChange={(e) => setPersonAlt(e.target.value)} />
              </div>
              <Button onClick={() => createPerson.mutate()} disabled={!personName.trim() || !personMobile.trim() || createPerson.isPending} className="w-full">
                {createPerson.isPending ? 'Creating…' : 'Create contact'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Contacts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {persons.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : persons.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.mobile}{p.alt_mobile ? ` · alt ${p.alt_mobile}` : ''}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setOccPersonId(p.id)}>Use</Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Assign to flat</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Flat</Label>
                <Select value={occFlatId} onValueChange={(v) => setOccFlatId(v ?? '')}>
                  <SelectTrigger data-testid="assign-flat-select"><SelectValue placeholder="Select flat" /></SelectTrigger>
                  <SelectContent>
                    {flats.map((f) => <SelectItem key={f.id} value={f.id}>{f.flat_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Person</Label>
                <Select value={occPersonId} onValueChange={(v) => setOccPersonId(v ?? '')}>
                  <SelectTrigger data-testid="assign-person-select"><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.mobile}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={occRole} onValueChange={(v) => setOccRole(v as 'OWNER' | 'TENANT')}>
                  <SelectTrigger data-testid="assign-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">OWNER</SelectItem>
                    <SelectItem value="TENANT">TENANT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => assignOcc.mutate()} disabled={!occFlatId || !occPersonId || assignOcc.isPending} className="w-full">
                {assignOcc.isPending ? 'Assigning…' : 'Assign'}
              </Button>

              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs font-medium">Default payer preview</div>
                <div className="mt-1 flex gap-2">
                  <Select value={dpFlatId} onValueChange={(v) => setDpFlatId(v ?? '')}>
                    <SelectTrigger className="flex-1" data-testid="preview-flat-select"><SelectValue placeholder="Select flat" /></SelectTrigger>
                    <SelectContent>
                      {flats.map((f) => <SelectItem key={f.id} value={f.id}>{f.flat_number}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={fetchDp} data-testid="preview-check-btn">Check</Button>
                </div>
                {dpResult && <div className="mt-2 text-xs text-muted-foreground">{dpResult}</div>}
                <p className="mt-1 text-[11px] text-muted-foreground">Tenant is returned first; owner is fallback.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opening" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Opening due (per flat)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Flat</Label>
                <Select value={odFlatId} onValueChange={(v) => { setOdFlatId(v ?? ''); setOdCurrent(null); }}>
                  <SelectTrigger data-testid="opening-flat-select"><SelectValue placeholder="Select flat" /></SelectTrigger>
                  <SelectContent>
                    {flats.map((f) => <SelectItem key={f.id} value={f.id}>{f.flat_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={fetchOd} disabled={!odFlatId} data-testid="opening-show-btn">Show current</Button>
              {odCurrent !== null && <div className="text-sm">Current opening due: <span className="font-semibold">₹{odCurrent}</span></div>}
              <div className="space-y-1">
                <Label>Amount (0 = clear, &gt;0 = owes)</Label>
                <Input type="number" placeholder="e.g. 2000" value={odAmount} onChange={(e) => setOdAmount(e.target.value)} />
              </div>
              <Button onClick={() => putOd.mutate()} disabled={!odFlatId || odAmount === '' || putOd.isPending} className="w-full">
                {putOd.isPending ? 'Saving…' : 'Set opening due'}
              </Button>
              <p className="text-xs text-muted-foreground">Positive means flat owes; 0 means clear. Tenant-first payer resolution is used by receipt entry (Issue 5).</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
