import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './guards'
import { AppShell } from './layouts/app-shell'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { ReceiptsPage } from '@/pages/receipts'
import { ExpensesPage } from '@/pages/expenses'
import { FlatsPage } from '@/pages/flats'
import { FundsPage } from '@/pages/funds'
import { ReportsPage } from '@/pages/reports'
import { NotFoundPage } from '@/pages/not-found'

/**
 * Phase 0 routes — pilot cashbook only.
 * Deferred (Phase 1): /billing, /members, /societies, /settings
 * See PHASE_0_PRD.md "Out of Scope".
 */
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
      { path: 'receipts', element: <ReceiptsPage /> },
      { path: 'expenses', element: <ExpensesPage /> },
      { path: 'flats', element: <FlatsPage /> },
      { path: 'funds', element: <FundsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
