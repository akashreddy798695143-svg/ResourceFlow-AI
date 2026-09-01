import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err, parseBody } from '@/lib/api'
import type { ResourceType, ResourceStatus } from '@prisma/client'

const TYPES: ResourceType[] = ['AMBULANCE', 'RESCUE_TEAM', 'FIRE_TEAM', 'EMERGENCY_VEHICLE', 'MEDICAL_SUPPLY', 'FOOD_SUPPLY', 'WATER_SUPPLY']

export async function GET() {
  try {
    await requireAuth(['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN'])
    const resources = await db.resource.findMany({ orderBy: { resourceCode: 'asc' } })
    return ok({ resources })
  } catch (e) {
    return handleAuthError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(['ADMIN'])
    const body = parseBody(await req.json())
    const { name, type, latitude, longitude, capacity, status, resourceCode } = body
    if (!name || !type) return err('name and type required', 422)
    if (!TYPES.includes(type)) return err('Invalid type', 422)
    const lat = Number(latitude), lng = Number(longitude)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return err('Invalid coordinates', 422)
    const cap = Math.max(1, Number(capacity || 1))
    const count = await db.resource.count()
    const code = String(resourceCode || `R${String(count + 1).padStart(2, '0')}`)
    const resource = await db.resource.create({
      data: {
        resourceCode: code,
        name: String(name),
        type,
        latitude: lat,
        longitude: lng,
        capacity: cap,
        status: (status as ResourceStatus) || 'AVAILABLE',
      },
    })
    return ok({ resource }, 201)
  } catch (e) {
    return handleAuthError(e)
  }
}
