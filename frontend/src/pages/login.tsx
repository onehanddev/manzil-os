import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Smartphone } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const API_BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
const AUTH_BASE = API_BASE.replace(/\/api$/, '')
const hasSupabaseEnv = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

type OtpVerifyResponse = {
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

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const demoMode = !hasSupabaseEnv

  if (accessToken) {
    return <Navigate to={from} replace />
  }

  function enterDemo() {
    setAuth({
      accessToken: 'demo-token',
      user: { id: 'user-dev', displayName: 'Dev User', mobile: phone || '+91 99999 99999' },
    })
    navigate(from, { replace: true })
  }

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (demoMode) {
      enterDemo()
      return
    }
    setBusy(true)
    try {
      await postJson(`${AUTH_BASE}/auth/otp/send`, { mobile: phone })
      setStep('otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP')
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (demoMode) return
    setBusy(true)
    try {
      const session = await postJson<OtpVerifyResponse>(`${AUTH_BASE}/auth/otp/verify`, {
        mobile: phone,
        token: otp,
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
      setError(err instanceof Error ? err.message : 'Could not verify OTP')
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
            Sign in with your registered mobile number
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
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
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {demoMode ? 'Continue' : 'Send OTP'}
              </Button>
              <div className="space-y-2">
                {demoMode && (
                  <p className="text-center text-xs text-muted-foreground">
                    Supabase is not configured — demo mode lets you explore the
                    app shell without a backend.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={enterDemo}
                >
                  Continue in demo mode
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">OTP sent to {phone}</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Verify
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep('phone')}
                disabled={busy}
              >
                Change number
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
