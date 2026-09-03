import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Smartphone } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiBase, getAuthBase } from '@/lib/api/base-url'

const API_BASE = getApiBase()
const AUTH_BASE = getAuthBase()

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

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (accessToken) {
    return <Navigate to={from} replace />
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const session = await postJson<LoginResponse>(`${AUTH_BASE}/auth/login`, {
        mobile: phone,
        password,
      })
      if (session.status === 'pending') {
        setInfo('Account pending approval — an admin will approve shortly.')
      }
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

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const session = await postJson<LoginResponse>(`${AUTH_BASE}/auth/signup`, {
        mobile: phone,
        password,
        display_name: displayName.trim() || undefined,
      })
      if (session.status === 'pending') {
        const token = session.access_token
        if (token) {
          try {
            const me = await getJson<MeResponse>(`${API_BASE}/me`, token)
            setAuth({
              accessToken: token,
              user: { id: me.user_id, displayName: me.mobile, mobile: me.mobile },
            })
          } catch {
            // token stored but me failed — keep pending message
          }
        }
        setInfo('Account created — pending admin approval. You can sign in after approval.')
        return
      }
      const me = await getJson<MeResponse>(`${API_BASE}/me`, session.access_token)
      setAuth({
        accessToken: session.access_token,
        user: { id: me.user_id, displayName: me.mobile, mobile: me.mobile },
      })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign up')
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
            {mode === 'login' ? 'Sign in with your registered mobile number and password' : 'Create an account with your mobile number — no email needed'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <button
              role="tab"
              aria-selected={mode === 'login'}
              aria-controls="login-panel"
              onClick={() => { setMode('login'); setError(null); setInfo(null) }}
              className={mode === 'login' ? 'rounded-lg bg-card py-2 text-sm font-medium shadow-sm' : 'rounded-lg py-2 text-sm text-muted-foreground'}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={mode === 'signup'}
              aria-controls="signup-panel"
              onClick={() => { setMode('signup'); setError(null); setInfo(null) }}
              className={mode === 'signup' ? 'rounded-lg bg-card py-2 text-sm font-medium shadow-sm' : 'rounded-lg py-2 text-sm text-muted-foreground'}
            >
              Sign up
            </button>
          </div>
          {mode === 'login' ? (
            <form onSubmit={handleSignIn} id="login-panel" role="tabpanel" className="space-y-4">
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
              {info && <p className="text-sm text-muted-foreground">{info}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} id="signup-panel" role="tabpanel" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-phone">Mobile number</Label>
                <Input
                  id="signup-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91 98xxx xxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">This number will be used for notifications.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Full name</Label>
                <Input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-emerald-600">{info}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Create account
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
