import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Flat = {
  id: string
  flat_number: string
  flat_category_id: string
  maintenance_amount?: number | null
  category_maintenance_amount?: number | null
  flat_category?: { maintenance_amount?: number | null } | null
}

export function ReceiptsPage() {
  const { data: flatData } = useQuery({
    queryKey: ['flats'],
    queryFn: () => api.get<{ flats: Flat[] }>('/flats'),
  })
  const flats = flatData?.flats ?? []

  const [selectedFlatId, setSelectedFlatId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Find selected flat's default amount
  const selectedFlat = flats.find((f) => f.id === selectedFlatId)
  const defaultAmount = selectedFlat
    ? (selectedFlat.maintenance_amount ?? selectedFlat.category_maintenance_amount ?? selectedFlat.flat_category?.maintenance_amount ?? null)
    : null

  // Prefill amount when flat changes (if default exists, set it; if no default, clear)
  // Allow manual override after prefill — but if user changes flat again, prefill again.
  useEffect(() => {
    if (!selectedFlatId) {
      setAmount('')
      return
    }
    if (defaultAmount != null) {
      setAmount(String(defaultAmount))
    } else {
      setAmount('')
    }
  }, [selectedFlatId, defaultAmount])

  const handleFlatChange = (val: string | null) => {
    setSelectedFlatId(val ?? '')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Record payments — amount prefills from flat category default.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Record maintenance receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Flat</Label>
            <Select value={selectedFlatId} onValueChange={handleFlatChange}>
              <SelectTrigger aria-label="Flat" data-testid="receipt-flat-select">
                <SelectValue placeholder="Select flat" />
              </SelectTrigger>
              <SelectContent>
                {flats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.flat_number} {f.maintenance_amount != null || f.category_maintenance_amount != null ? `(₹${f.maintenance_amount ?? f.category_maintenance_amount})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedFlat && (
              <p className="text-xs text-muted-foreground">
                {defaultAmount != null ? `Default from category: ₹${defaultAmount}` : 'No default — leave empty or enter amount'}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-amount">Amount</Label>
            <Input
              id="receipt-amount"
              type="text"
              inputMode="numeric"
              placeholder={defaultAmount != null ? `Default ₹${defaultAmount}` : 'Enter amount'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="receipt-date">Date</Label>
            <Input id="receipt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <Button
            className="w-full"
            onClick={() => {
              if (!selectedFlatId) {
                toast.error('Select a flat')
                return
              }
              if (!amount || Number(amount) <= 0) {
                toast.error('Enter a valid amount')
                return
              }
              toast.success(`Receipt ₹${amount} for ${selectedFlat?.flat_number} on ${date} — ready to submit`)
            }}
          >
            Save receipt
          </Button>

          <p className="text-xs text-muted-foreground">
            Prefill: selecting a flat fills amount from its category&apos;s <code>maintenance_amount</code>. If no default, amount stays empty.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent receipts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Receipt list will show here (existing receipts + new ones).</p>
        </CardContent>
      </Card>
    </div>
  )
}
