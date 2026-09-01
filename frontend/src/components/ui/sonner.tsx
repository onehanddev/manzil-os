"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      expand={false}
      visibleToasts={2}
      closeButton={false}
      icons={{
        success: <CircleCheckIcon className="size-4 shrink-0" />,
        info: <InfoIcon className="size-4 shrink-0" />,
        warning: <TriangleAlertIcon className="size-4 shrink-0" />,
        error: <OctagonXIcon className="size-4 shrink-0" />,
        loading: <Loader2Icon className="size-4 shrink-0 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "999px",
          bottom: "calc(88px + env(safe-area-inset-bottom))",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group pointer-events-auto flex min-h-12 w-full max-w-[min(92vw,380px)] items-center gap-3 rounded-2xl border bg-popover/90 px-4 py-3 text-sm font-medium text-popover-foreground shadow-[0_8px_32px_rgb(23_32_30/0.18)] backdrop-blur-xl supports-backdrop-filter:bg-popover/80 data-[type=success]:border-emerald-200 data-[type=success]:bg-emerald-50/95 data-[type=error]:border-destructive/20 data-[type=error]:bg-destructive/10",
          title: "text-sm font-medium leading-tight",
          description: "text-xs text-muted-foreground",
          icon: "shrink-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
