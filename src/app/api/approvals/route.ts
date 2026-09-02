import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok } from '@/lib/api'

// GET /api/approvals — pending approvals (officer/admin)
export async function GET(req: NextRequest) {
  try {
    await requireAuth(['DISASTER_OFFICER', 'ADMIN'])
    const { searchParams } = new URL(req.url)
    const decision = searchParams.get('decision') || 'PENDING'
    const approvals = await db.approval.findMany({
      where: { decision: decision as any },
      orderBy: { createdAt: 'desc' },
      include: {
        incident: {
          select: {
            incidentCode: true, type: true, location: true, riskLevel: true, riskScore: true,
            description: true, language: true, inputMethod: true, originalDescription: true,
            // Citizen contact info — shown to officers/admins while approving
            citizenName: true, citizenPhone: true, citizenEmail: true,
            reportedById: true,
          },
        },
      },
    })
    return ok({ approvals })
  } catch (e) {
    return handleAuthError(e)
  }
}
