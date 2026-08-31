import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PagePlaceholder({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children ?? (
        <div className="rounded-xl border bg-muted/20 p-8 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
            <Construction className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-medium">This section is coming soon</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            We&apos;re building the full UX for {title.toLowerCase()} — receipts and flats are ready to try in the meantime.
          </p>
          <Link to="/dashboard" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}>
            Back to dashboard
          </Link>
        </div>
      )}
    </div>
  )
}
