import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders } from '@/test/utils'
import { server } from '@/test/server'
import { PeoplePage } from './people'

describe('PeoplePage', () => {
  it('searches by name or mobile and adds a person from a sheet', async () => {
    let persons: { id: string; name: string; mobile: string; alt_mobile: string | null }[] = [
      { id: 'person-1', name: 'Asha Shah', mobile: '9000000001', alt_mobile: null },
      { id: 'person-2', name: 'Ravi Mehta', mobile: '9000000002', alt_mobile: null },
    ]
    server.use(
      http.get('*/api/persons', () => HttpResponse.json({ persons })),
      http.post('*/api/persons', async ({ request }) => {
        const body = await request.json() as { name: string; mobile: string; alt_mobile?: string }
        const person = { id: 'person-3', ...body, alt_mobile: body.alt_mobile ?? null }
        persons = [...persons, person]
        return HttpResponse.json(person, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PeoplePage />)

    const search = await screen.findByRole('searchbox', { name: 'Search people' })
    await user.type(search, '0002')
    expect(screen.getByText('Ravi Mehta')).toBeInTheDocument()
    expect(screen.queryByText('Asha Shah')).not.toBeInTheDocument()

    await user.clear(search)
    await user.click(screen.getByRole('button', { name: 'Add person' }))
    await user.type(screen.getByLabelText('Name'), 'Neha Patel')
    await user.type(screen.getByLabelText('Mobile'), '9000000003')
    await user.click(screen.getByRole('button', { name: 'Create person' }))

    expect(await screen.findByText('Neha Patel')).toBeInTheDocument()
  })

  it('shows request failures as errors instead of empty people', async () => {
    server.use(http.get('*/api/persons', () => HttpResponse.json({ detail: 'Unavailable' }, { status: 500 })))
    renderWithProviders(<PeoplePage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('People could not be loaded')
    expect(screen.queryByText('No people yet')).not.toBeInTheDocument()
  })
})
