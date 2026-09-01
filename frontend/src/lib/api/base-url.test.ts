import { expect, test } from 'vitest'
import { getApiBase, getAuthBase } from './base-url'

test('normalizes a bare API_URL deployment host into the API origin', () => {
  const env = { API_URL: 'api.manzil-os.com' } as ImportMetaEnv

  expect(getApiBase(env)).toBe('https://api.manzil-os.com/api')
  expect(getAuthBase(env)).toBe('https://api.manzil-os.com')
})
