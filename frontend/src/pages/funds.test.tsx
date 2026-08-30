import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import { FundsPage } from './funds'

describe('FundsPage — funds / vendors / expense categories (TDD)', () => {
  it('shows seeded funds Main Fund and Sinking Fund from MSW', async () => {
    renderWithProviders(<FundsPage />)
    expect(await screen.findByText('Main Fund')).toBeInTheDocument()
    expect(screen.getByText('Sinking Fund')).toBeInTheDocument()
  })

  it('creates and lists a fund (real MSW store)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FundsPage />)
    expect(await screen.findByText('Main Fund')).toBeInTheDocument()
    const input = screen.getByLabelText(/Fund name/i)
    await user.type(input, `FUND-${Date.now()}`)
    await user.click(screen.getByRole('button', { name: /^Create$/ }))
    // creation uses MSW in-memory store; list will contain the new name after invalidation
    expect(await screen.findByText(/FUND-/)).toBeInTheDocument()
  })

  it('creates vendor and expense category via tabs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FundsPage />)
    await user.click(screen.getByRole('tab', { name: /Vendors/i }))
    const vendorInput = await screen.findByLabelText(/^Name$/)
    await user.type(vendorInput, `VENDOR-${Date.now()}`)
    await user.click(screen.getByRole('button', { name: /^Create$/ }))
    expect(await screen.findByText(/VENDOR-/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Expense Categories/i }))
    const catInput = await screen.findByLabelText(/Category name/i)
    await user.type(catInput, `EXPCAT-${Date.now()}`)
    await user.click(screen.getByRole('button', { name: /^Create$/ }))
    expect(await screen.findByText(/EXPCAT-/)).toBeInTheDocument()
  })
})
