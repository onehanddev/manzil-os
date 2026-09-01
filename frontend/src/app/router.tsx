import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './guards'
import { AppShell } from './layouts/app-shell'
import { LoginPage } from '@/pages/login'
import { DashboardPage } from '@/pages/dashboard'
import { ReceiptsPage } from '@/pages/receipts'
import { ExpensesPage } from '@/pages/expenses'
import { FlatsPage } from '@/pages/flats'
import { ExpenseCategoriesPage, FundsPage, VendorsPage } from '@/pages/funds'
import { PeoplePage } from '@/pages/people'
import { FlatCategoriesPage } from '@/pages/flat-categories'
import { ReportsPage } from '@/pages/reports'
import { NotFoundPage } from '@/pages/not-found'

/**
 * Phase 0 routes — pilot cashbook only.
 * Deferred (Phase 1): /billing, /members, /societies, /settings
 * See PHASE_0_PRD.md "Out of Scope".
 */
// When served via manzilos.vercel.app/app (proxied by web), the PWA lives under /app.
// Detect at runtime so the same build works both at manzilos-app.vercel.app/ and /app/*
const basename = typeof window !== 'undefined' && window.location.pathname.startsWith('/app') ? '/app' : '/'

export const router = createBrowserRouter(
  [
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
        { path: 'people', element: <PeoplePage /> },
        { path: 'flat-categories', element: <FlatCategoriesPage /> },
        { path: 'funds', element: <FundsPage /> },
        { path: 'vendors', element: <VendorsPage /> },
        { path: 'expense-categories', element: <ExpenseCategoriesPage /> },
        { path: 'reports', element: <ReportsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: basename === '/' ? undefined : basename },
)
