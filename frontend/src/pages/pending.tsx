import { useAuthStore } from '@/stores/auth-store'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock3 } from 'lucide-react'

export function PendingPage() {
  const clear = useAuthStore((s) => s.clear)
  const navigate = useNavigate()

  function handleSignOut() {
    clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 pt-[env(safe-area-inset-top)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Clock3 className="size-6" />
          </div>
          <CardTitle>Pending approval</CardTitle>
          <CardDescription>
            Your account is waiting for a society admin to approve it. You will be able to sign in after approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If an admin has approved you, try signing in again. Collectors get access to receipts and reports once active.
          </p>
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
