import { EntitySettingsPage, type SettingsEntity } from '@/components/settings/entity-settings-page'

export function PeoplePage() {
  return (
    <EntitySettingsPage
      title="People"
      description="Owners, tenants, and contacts available for flat assignments."
      singular="person"
      endpoint="/persons"
      queryKey="persons"
      responseKeys={['persons']}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Full name', required: true },
        { key: 'mobile', label: 'Mobile', placeholder: '9000000000', required: true, type: 'tel', inputMode: 'tel' },
        { key: 'alt_mobile', label: 'Alternate mobile', placeholder: 'Optional', type: 'tel', inputMode: 'tel' },
      ]}
      summary={(entity: SettingsEntity) => [entity.mobile, entity.alt_mobile].filter(Boolean).join(' · ')}
    />
  )
}
