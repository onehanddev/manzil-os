import { RequireAuth } from '@/app/guards'
import { AppShell } from './app-shell'

export function ProtectedAppShell() {
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  )
}
