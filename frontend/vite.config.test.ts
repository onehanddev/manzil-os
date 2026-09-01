import { expect, test } from 'vitest'
import config from './vite.config'

test('exposes the legacy API_URL deployment variable to the browser bundle', () => {
  expect(config).toEqual(
    expect.objectContaining({
      envPrefix: expect.arrayContaining(['API_URL']),
    }),
  )
})
