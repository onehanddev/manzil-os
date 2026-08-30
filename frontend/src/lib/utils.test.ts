import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('handles conditional values', () => {
    expect(cn('a', false && 'b', null, 'c')).toBe('a c')
  })

  it('resolves tailwind conflicts in favor of the last class', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})
