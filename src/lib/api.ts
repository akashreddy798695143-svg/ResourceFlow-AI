// Small helpers to standardise JSON API responses from route handlers.
import { NextResponse } from 'next/server'
import { AuthError } from '@/lib/auth'

export function ok(data: any, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status = 400, extra: any = {}) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export function handleAuthError(e: unknown) {
  if (e instanceof AuthError) return err(e.message, e.status)
  return err(String((e as Error)?.message ?? e), 500)
}

export function parseBody(body: any): Record<string, any> {
  return (body ?? {}) as Record<string, any>
}
