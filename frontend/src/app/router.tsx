import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LoginPage } from '@/pages/login'
import { OnboardingPage } from '@/pages/onboarding'
import { PendingPage } from '@/pages/pending'

const protectedShellRoute = async () => ({ Component: (await import('./layouts/protected-app-shell')).ProtectedAppShell })
const dashboardRoute = async () => ({ Component: (await import('@/pages/dashboard')).DashboardPage })
const receiptsRoute = async () => ({ Component: (await import('@/pages/receipts')).ReceiptsPage })
const expensesRoute = async () => ({ Component: (await import('@/pages/expenses')).ExpensesPage })
const flatsRoute = async () => ({ Component: (await import('@/pages/flats')).FlatsPage })
const fundsRoute = async () => ({ Component: (await import('@/pages/funds')).FundsPage })
const vendorsRoute = async () => ({ Component: (await import('@/pages/funds')).VendorsPage })
const expenseCategoriesRoute = async () => ({ Component: (await import('@/pages/funds')).ExpenseCategoriesPage })
const peopleRoute = async () => ({ Component: (await import('@/pages/people')).PeoplePage })
const flatCategoriesRoute = async () => ({ Component: (await import('@/pages/flat-categories')).FlatCategoriesPage })
const reportsRoute = async () => ({ Component: (await import('@/pages/reports')).ReportsPage })
const notFoundRoute = async () => ({ Component: (await import('@/pages/not-found')).NotFoundPage })

/**
 * Phase 0 routes — pilot cashbook only.
 * Deferred (Phase 1): /billing, /members, /societies, /settings
 * See PHASE_0_PRD.md "Out of Scope".
 */
export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    { path: '/onboarding', element: <OnboardingPage /> },
    { path: '/pending', element: <PendingPage /> },
    {
      lazy: protectedShellRoute,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', lazy: dashboardRoute },
        { path: 'receipts', lazy: receiptsRoute },
        { path: 'expenses', lazy: expensesRoute },
        { path: 'flats', lazy: flatsRoute },
        { path: 'people', lazy: peopleRoute },
        { path: 'flat-categories', lazy: flatCategoriesRoute },
        { path: 'funds', lazy: fundsRoute },
        { path: 'vendors', lazy: vendorsRoute },
        { path: 'expense-categories', lazy: expenseCategoriesRoute },
        { path: 'reports', lazy: reportsRoute },
        { path: '*', lazy: notFoundRoute },
      ],
    },
  ],
  { basename: '/' },
)
