import { EntitySettingsPage, type SettingsEntity } from '@/components/settings/entity-settings-page'

export function FundsPage() {
  return (
    <EntitySettingsPage
      title="Funds"
      description="Money buckets used when recording receipts and expenses."
      singular="fund"
      endpoint="/funds"
      queryKey="funds"
      responseKeys={['funds']}
      fields={[{ key: 'name', label: 'Fund name', placeholder: 'Repair Fund', required: true }]}
    />
  )
}

export function VendorsPage() {
  return (
    <EntitySettingsPage
      title="Vendors"
      description="People and businesses paid through expense entries."
      singular="vendor"
      endpoint="/vendors"
      queryKey="vendors"
      responseKeys={['vendors']}
      fields={[
        { key: 'name', label: 'Vendor name', placeholder: 'Lift Care', required: true },
        { key: 'contact_info', label: 'Contact information', placeholder: 'Phone or email' },
      ]}
      summary={(entity: SettingsEntity) => entity.contact_info as string | null}
    />
  )
}

export function ExpenseCategoriesPage() {
  return (
    <EntitySettingsPage
      title="Expense Categories"
      description="Clear labels used to group society spending."
      singular="expense category"
      endpoint="/expense-categories"
      queryKey="expense-categories"
      responseKeys={['categories', 'expense_categories']}
      fields={[{ key: 'name', label: 'Category name', placeholder: 'Water', required: true }]}
    />
  )
}
