import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { LoginPage } from './login'
import { renderWithProviders } from '@/test/utils'
import { useAuthStore } from '@/stores/auth-store'

describe('LoginPage', () => {
  it('renders the phone sign-in form', () => {
    renderWithProviders(<LoginPage />, { route: '/login' })
    expect(screen.getByText('Manzil OS')).toBeInTheDocument()
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument()
  })

  it('enters demo mode and stores an auth session', () => {
    renderWithProviders(<LoginPage />, { route: '/login' })

    fireEvent.change(screen.getByLabelText('Mobile number'), {
      target: { value: '+91 90000 00000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue in demo mode' }))

    expect(useAuthStore.getState().accessToken).toBe('demo-token')
    expect(useAuthStore.getState().user?.displayName).toBe('Dev User')
  })
})
