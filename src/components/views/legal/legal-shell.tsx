'use client'

import { ReactNode } from 'react'
import { useRouter } from '@/lib/use-router'
import { ArrowLeft, LucideIcon } from 'lucide-react'
import { Footer } from '@/components/shared/footer'

// Shared layout for public information pages (privacy, terms, safety, about, contact).
// Reuses the existing ResourceFlow AI design system: same header pattern, cards,
// spacing, typography and footer — no new visual identity.

export function LegalShell({
  title,
  subtitle,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
}) {
  const { navigate } = useRouter()

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/75 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mb-8">{subtitle}</p>}
        {children}
      </main>

      <Footer />
    </div>
  )
}

export function LegalSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        {title}
      </h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </div>
  )
}

export function LegalSectionList({
  sections,
}: {
  sections: { icon: LucideIcon; title: string; body: ReactNode }[]
}) {
  return <div className="space-y-4">{sections.map((s) => (
    <LegalSection key={s.title} icon={s.icon} title={s.title}>{s.body}</LegalSection>
  ))}</div>
}
