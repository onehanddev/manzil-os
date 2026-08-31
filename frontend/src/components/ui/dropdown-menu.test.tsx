import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './dropdown-menu'

describe('DropdownMenu', () => {
  it('renders labels without requiring a separate group context', () => {
    expect(() => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Society</DropdownMenuLabel>
            <DropdownMenuItem>Alpha</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      )
    }).not.toThrow()

    expect(screen.getByText('Society')).toBeInTheDocument()
  })
})
