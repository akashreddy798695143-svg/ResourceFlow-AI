// Verified Alert Feed — citizens read only officer/system-published alerts.
// Officers/admins publish; citizens can never create, edit or delete alerts.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { recordAudit, broadcastEvent } from '@/lib/events'
import type { Severity } from '@prisma/client'

// GET /api/citizen/verified-alerts — active alerts (all authenticated users)
export async function GET() {
  try {
    await requireAuth()
    const alerts = await db.verifiedAlert.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, title: true, body: true, severity: true, area: true,
        incidentId: true, language: true, createdAt: true, expiresAt: true,
      },
    })
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    alerts.sort((a, b) => (order[a.severity] - order[b.severity]) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    return NextResponse.json({ alerts })
  } catch (e) {
    return handleAuthError(e)
  }
}

// POST /api/citizen/verified-alerts — publish alert (OFFICER/ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const body = await req.json().catch(() => ({}))
    const title = String(body.title || '').trim().slice(0, 200)
    const alertBody = String(body.body || '').trim().slice(0, 1500)
    if (!title || !alertBody) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 422 })
    }
    const alert = await db.verifiedAlert.create({
      data: {
        title,
        body: alertBody,
        severity: (['LOW','MEDIUM','HIGH','CRITICAL'].includes(body.severity) ? body.severity : 'MEDIUM') as Severity,
        area: typeof body.area === 'string' ? body.area.slice(0, 200) : null,
        incidentId: typeof body.incidentId === 'string' ? body.incidentId : null,
        language: typeof body.language === 'string' ? body.language.slice(0, 5).toLowerCase() : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        publishedById: user.id,
      },
    })
    await recordAudit({ userId: user.id, role: user.role, action: 'VERIFIED_ALERT_PUBLISHED', entityId: alert.id, newState: alert.severity })
    await broadcastEvent({ type: 'VERIFIED_ALERT', label: `Verified alert: ${title}`, data: { id: alert.id, severity: alert.severity } })
    return NextResponse.json({ alert }, { status: 201 })
  } catch (e) {
    return handleAuthError(e)
  }
}

// DELETE /api/citizen/verified-alerts?id= — deactivate alert (OFFICER/ADMIN only)
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 422 })
    await db.verifiedAlert.updateMany({ where: { id }, data: { active: false } })
    await recordAudit({ userId: user.id, role: user.role, action: 'VERIFIED_ALERT_DEACTIVATED', entityId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleAuthError(e)
  }
}
