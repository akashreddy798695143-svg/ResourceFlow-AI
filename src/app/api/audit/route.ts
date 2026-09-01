import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'

const ALLOWED_ACTIONS = [
  'LOGIN', 'REGISTER', 'INCIDENT_CREATED', 'AI_ANALYSIS', 'RISK_CALCULATED',
  'RESOURCE_RECOMMENDED', 'APPROVAL_GRANTED', 'APPROVAL_REJECTED', 'RESOURCE_ASSIGNED',
  'RESOURCE_UNAVAILABLE', 'REASSIGNMENT', 'ESCALATION', 'INCIDENT_RESOLVED', 'RESPONSE_DELAYED',
]

// GET /api/audit — admin only
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['ADMIN'])
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const limit = Math.min(500, Number(searchParams.get('limit') || 200))
    const where: any = {}
    if (action && ALLOWED_ACTIONS.includes(action)) where.action = action
    const logs = await db.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: { user: { select: { name: true, email: true } } },
    })
    return ok({ logs })
  } catch (e) {
    return handleAuthError(e)
  }
}
