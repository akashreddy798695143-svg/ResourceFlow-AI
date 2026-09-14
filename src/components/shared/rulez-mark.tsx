'use client'
// RuleZ — product identity mark for RESOURCEFLOW AI.
// Rendered as a compact pill so it sits in nav bars and headers without
// competing with the RESOURCEFLOW AI wordmark. Purely presentational.

import { cn } from '@/lib/utils'

export function RuleZMark({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-bold tracking-wider select-none',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      title="RuleZ — RESOURCEFLOW AI"
      aria-label="RuleZ"
    >
      <span
        className={cn(
          'rounded-full bg-gradient-to-br from-amber-400 to-orange-600 shrink-0',
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
        )}
      />
      <span className="leading-none">
        Rule<span className="text-amber-400">Z</span>
      </span>
    </span>
  )
}
