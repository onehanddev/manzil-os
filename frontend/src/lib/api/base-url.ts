const DEFAULT_API_BASE = '/api'

export function getApiBase(env: ImportMetaEnv = import.meta.env) {
  return (env.VITE_API_URL ?? env.API_URL ?? DEFAULT_API_BASE).replace(/\/$/, '')
}

export function getAuthBase(env: ImportMetaEnv = import.meta.env) {
  return getApiBase(env).replace(/\/api$/, '')
}
