import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import { handleResourceUnavailable } from '@/lib/workflows/incident-workflow'
import type { ResourceStatus } from '@prisma/client'

const STATUSES: ResourceStatus[] = ['AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'UNAVAILABLE']

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(['ADMIN', 'DISASTER_OFFICER', 'RESPONDER'])
    const { id } = await ctx.params
    const body = parseBody(await req.json())
    const resource = await db.resource.findUnique({ where: { id } })
    if (!resource) return err('Resource not found', 404)

    const data: any = { lastUpdated: new Date() }
    if (body.name) data.name = String(body.name)
    if (body.capacity) data.capacity = Math.max(1, Number(body.capacity))
    if (body.latitude != null) data.latitude = Number(body.latitude)
    if (body.longitude != null) data.longitude = Number(body.longitude)
    if (body.status) {
      if (!STATUSES.includes(body.status)) return err('Invalid status', 422)
      data.status = body.status
    }
    const updated = await db.resource.update({ where: { id }, data })

    // Adaptive reassignment: if resource becomes UNAVAILABLE while assigned
    if (body.status === 'UNAVAILABLE') {
      await handleResourceUnavailable(id, String(body.reason || 'Status set to unavailable'))
    }
    return ok({ resource: updated })
  } catch (e) {
    return handleAuthError(e)
  }
}
