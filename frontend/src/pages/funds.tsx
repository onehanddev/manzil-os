import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Fund = { id: string; society_id: string; name: string; is_active: boolean }
type Vendor = { id: string; society_id: string; name: string; contact_info: string | null; is_active: boolean }
type ExpenseCategory = { id: string; society_id: string; name: string; is_active: boolean }

function useFunds() {
  return useQuery({ queryKey: ['funds'], queryFn: () => api.get<{ funds: Fund[] }>('/funds') })
}
function useVendors() {
  return useQuery({ queryKey: ['vendors'], queryFn: () => api.get<{ vendors: Vendor[] }>('/vendors') })
}
function useExpenseCategories() {
  return useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get<{ categories: ExpenseCategory[]; expense_categories: ExpenseCategory[] }>('/expense-categories'),
  })
}

export function FundsPage() {
  const qc = useQueryClient()
  const { data: fundData, isLoading: fundLoading, error: fundError } = useFunds()
  const { data: vendorData, isLoading: vendorLoading } = useVendors()
  const { data: expCatData, isLoading: expCatLoading } = useExpenseCategories()

  const funds = fundData?.funds ?? []
  const vendors = vendorData?.vendors ?? []
  const categories = expCatData?.categories ?? expCatData?.expense_categories ?? []

  const [fundName, setFundName] = useState('')
  const createFund = useMutation({
    mutationFn: () => api.post<Fund>('/funds', { name: fundName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funds'] })
      setFundName('')
      toast.success('Fund created')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to create fund'),
  })

  const [vendorName, setVendorName] = useState('')
  const [vendorContact, setVendorContact] = useState('')
  const createVendor = useMutation({
    mutationFn: () => api.post<Vendor>('/vendors', { name: vendorName, contact_info: vendorContact || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setVendorName('')
      setVendorContact('')
      toast.success('Vendor created')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to create vendor'),
  })

  const [expCatName, setExpCatName] = useState('')
  const createExpCat = useMutation({
    mutationFn: () => api.post<ExpenseCategory>('/expense-categories', { name: expCatName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] })
      setExpCatName('')
      toast.success('Expense category created')
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Failed to create category'),
  })

  if (fundError instanceof ApiError && fundError.status === 403) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-muted-foreground">Collector access is restricted. Funds and master data are admin-only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funds &amp; Master Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">Funds, vendors/payees, and expense categories — required before financial entry.</p>
      </div>

      <Tabs defaultValue="funds">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="funds">Funds</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="categories">Expense Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="funds" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Create fund</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="fund-name">Fund name</Label>
                <Input id="fund-name" placeholder="e.g. Main Fund" value={fundName} onChange={(e) => setFundName(e.target.value)} />
              </div>
              <Button onClick={() => createFund.mutate()} disabled={!fundName.trim() || createFund.isPending} className="w-full">
                {createFund.isPending ? '…' : 'Create fund'}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Funds</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {fundLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : funds.length === 0 ? <p className="text-sm text-muted-foreground">No funds yet.</p> : funds.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{f.is_active ? 'Active' : 'Inactive'}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Create vendor / payee</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="vendor-name">Name</Label>
                <Input id="vendor-name" placeholder="e.g. MSEB, Lift Vendor" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vendor-contact">Contact info (optional)</Label>
                <Input id="vendor-contact" placeholder="Phone or email" value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} />
              </div>
              <Button onClick={() => createVendor.mutate()} disabled={!vendorName.trim() || createVendor.isPending} className="w-full">
                {createVendor.isPending ? '…' : 'Create vendor'}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Vendors</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {vendorLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : vendors.length === 0 ? <p className="text-sm text-muted-foreground">No vendors yet.</p> : vendors.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{v.contact_info ?? 'No contact'} · {v.is_active ? 'Active' : 'Inactive'}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Create expense category</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="exp-cat-name">Category name</Label>
                <Input id="exp-cat-name" placeholder="e.g. Electricity" value={expCatName} onChange={(e) => setExpCatName(e.target.value)} />
              </div>
              <Button onClick={() => createExpCat.mutate()} disabled={!expCatName.trim() || createExpCat.isPending} className="w-full">
                {createExpCat.isPending ? '…' : 'Create expense category'}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Expense Categories</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {expCatLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : categories.length === 0 ? <p className="text-sm text-muted-foreground">No categories yet.</p> : categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.is_active ? 'Active' : 'Inactive'}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
