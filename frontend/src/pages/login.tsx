import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Smartphone } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const API_BASE = (import.meta.env.API_URL ?? '/api').replace(/\/$/, '')
const AUTH_BASE = API_BASE.replace(/\/api$/, '')

type LoginResponse = {
  access_token: string
  token_type: string
  status: 'active' | 'pending'
}

type MeResponse = {
  user_id: string
  mobile: string
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { detail?: string }
    throw new Error(data.detail ?? `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { detail?: string }
    throw new Error(data.detail ?? `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

export function LoginPage() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (accessToken) {
    return <Navigate to={from} replace />
  }


  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const session = await postJson<LoginResponse>(`${AUTH_BASE}/auth/login`, {
        mobile: phone,
        password,
      })
      const me = await getJson<MeResponse>(`${API_BASE}/me`, session.access_token)
      setAuth({
        accessToken: session.access_token,
        user: {
          id: me.user_id,
          displayName: me.mobile,
          mobile: me.mobile,
        },
      })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 pt-[env(safe-area-inset-top)]">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Smartphone className="size-6" />
          </div>
          <CardTitle className="text-xl">Manzil OS</CardTitle>
          <CardDescription>
            Sign in with your registered mobile number and password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98xxx xxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Sign in
            </Button>
            
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
