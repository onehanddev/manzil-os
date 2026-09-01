import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './login'
import { renderWithProviders } from '@/test/utils'
import { useAuthStore } from '@/stores/auth-store'

describe('LoginPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.getState().clear()
  })

  it('renders the registered mobile and password sign-in form', () => {
    renderWithProviders(<LoginPage />, { route: '/login' })
    expect(screen.getByText('Manzil OS')).toBeInTheDocument()
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('signs in with mobile and password instead of SMS OTP', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'prod-token', token_type: 'bearer', status: 'active' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user_id: 'user-1', mobile: '+919000000000' }), { status: 200 }))

    renderWithProviders(<LoginPage />, { route: '/login' })

    await user.type(screen.getByLabelText('Mobile number'), '+91 90000 00000')
    await user.type(screen.getByLabelText('Password'), 'safe-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('prod-token'))
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mobile: '+91 90000 00000', password: 'safe-password' }),
      }),
    )
    expect(globalThis.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/auth/otp/send'), expect.anything())
  })

  it('enters demo mode and stores an auth session', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />, { route: '/login' })

    await user.type(screen.getByLabelText('Mobile number'), '+91 90000 00000')
    await user.click(screen.getByRole('button', { name: 'Continue in demo mode' }))

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('demo-token'))
    expect(useAuthStore.getState().user?.displayName).toBe('Dev User')
  })
})
