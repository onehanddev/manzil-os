import { spawn } from 'node:child_process'

const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
  stdio: 'inherit',
})

async function waitForPreview() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4173/login')
      if (response.ok) return
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Vite preview did not start within 15 seconds')
}

try {
  await waitForPreview()
  const cypress = spawn('npx', [
    'cypress',
    'run',
    '--config',
    'baseUrl=http://127.0.0.1:4173',
    '--spec',
    'cypress/e2e/pwa-accessibility.cy.ts',
  ], { stdio: 'inherit' })
  const exitCode = await new Promise((resolve) => cypress.on('exit', resolve))
  if (exitCode !== 0) process.exitCode = exitCode ?? 1
} finally {
  preview.kill('SIGTERM')
}
