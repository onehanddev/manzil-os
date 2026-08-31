import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './dropdown-menu'

describe('DropdownMenu', () => {
  it('renders labels without requiring a separate group context', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Society</DropdownMenuLabel>
          <DropdownMenuItem>Alpha</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByText('Society')).toBeInTheDocument()
  })
})
