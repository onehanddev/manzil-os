import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-semibold">404</p>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Button render={<Link to="/dashboard" />}>Go to dashboard</Button>
    </div>
  )
}
