const DEFAULT_API_BASE = '/api'

export function getApiBase(env: ImportMetaEnv = import.meta.env) {
  const value = (env.VITE_API_URL ?? env.API_URL ?? DEFAULT_API_BASE).replace(/\/$/, '')
  if (value.startsWith('/')) return value

  const origin = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
  return origin.endsWith('/api') ? origin : `${origin}/api`
}

export function getAuthBase(env: ImportMetaEnv = import.meta.env) {
  return getApiBase(env).replace(/\/api$/, '')
}
