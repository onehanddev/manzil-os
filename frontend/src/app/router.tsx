import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './guards'
import { AppShell } from './layouts/app-shell'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { SocietiesPage } from '@/pages/societies'
import { BillingPage } from '@/pages/billing'
import { ReceiptsPage } from '@/pages/receipts'
import { ExpensesPage } from '@/pages/expenses'
import { MembersPage } from '@/pages/members'
import { FlatsPage } from '@/pages/flats'
import { FundsPage } from '@/pages/funds'
import { ReportsPage } from '@/pages/reports'
import { SettingsPage } from '@/pages/settings'
import { NotFoundPage } from '@/pages/not-found'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'societies', element: <SocietiesPage /> },
      { path: 'billing', element: <BillingPage /> },
      { path: 'receipts', element: <ReceiptsPage /> },
      { path: 'expenses', element: <ExpensesPage /> },
      { path: 'members', element: <MembersPage /> },
      { path: 'flats', element: <FlatsPage /> },
      { path: 'funds', element: <FundsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
