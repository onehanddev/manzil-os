import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('prevents deployed app shell and service worker from being cached stale', () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
  }

  expect(config.headers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: '/index.html',
        headers: expect.arrayContaining([
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ]),
      }),
      expect.objectContaining({
        source: '/service-worker.js',
        headers: expect.arrayContaining([
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ]),
      }),
    ]),
  )
})
