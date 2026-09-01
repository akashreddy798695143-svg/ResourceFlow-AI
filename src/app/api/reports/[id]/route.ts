import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'

// GET /api/reports/[id] — generated incident report
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['DISASTER_OFFICER', 'ADMIN', 'CITIZEN'])
    const { id } = await ctx.params
    const report = await db.generatedReport.findUnique({ where: { incidentId: id } })
    if (!report) return err('Report not generated yet (incident may not be resolved)', 404)
    return ok({ report: { ...report, content: JSON.parse(report.content) } })
  } catch (e) {
    return handleAuthError(e)
  }
}
