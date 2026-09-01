import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { ok } from '@/lib/api'

// POST /api/admin/seed — idempotent seed of demo users + resources
export async function POST(_req: NextRequest) {
  const users = [
    { email: 'admin@resourceflow.ai', name: 'Site Admin', role: 'ADMIN', password: 'demo1234' },
    { email: 'officer@resourceflow.ai', name: 'Disaster Officer', role: 'DISASTER_OFFICER', password: 'demo1234' },
    { email: 'responder@resourceflow.ai', name: 'Field Responder', role: 'RESPONDER', password: 'demo1234' },
    { email: 'citizen@resourceflow.ai', name: 'Demo Citizen', role: 'CITIZEN', password: 'demo1234' },
  ]
  const createdUsers: any[] = []
  for (const u of users) {
    const existing = await db.user.findUnique({ where: { email: u.email } })
    if (existing) { createdUsers.push(existing); continue }
    const user = await db.user.create({
      data: { email: u.email, name: u.name, role: u.role as any, passwordHash: await hashPassword(u.password) },
    })
    createdUsers.push(user)
  }

  // Seed resources if none exist
  const existingResources = await db.resource.count()
  if (existingResources === 0) {
    const resources = [
      { resourceCode: 'R14', name: 'Rescue Team Alpha', type: 'RESCUE_TEAM', latitude: 28.6140, longitude: 77.2100, capacity: 12 },
      { resourceCode: 'R22', name: 'Rescue Team Bravo', type: 'RESCUE_TEAM', latitude: 28.6200, longitude: 77.2200, capacity: 10 },
      { resourceCode: 'A03', name: 'Ambulance 03', type: 'AMBULANCE', latitude: 28.6150, longitude: 77.2150, capacity: 2 },
      { resourceCode: 'A07', name: 'Ambulance 07', type: 'AMBULANCE', latitude: 28.6250, longitude: 77.2300, capacity: 2 },
      { resourceCode: 'F02', name: 'Fire Team 02', type: 'FIRE_TEAM', latitude: 28.6100, longitude: 77.2050, capacity: 8 },
      { resourceCode: 'EV01', name: 'Emergency Vehicle 01', type: 'EMERGENCY_VEHICLE', latitude: 28.6180, longitude: 77.2180, capacity: 6 },
      { resourceCode: 'EV02', name: 'Emergency Vehicle 02', type: 'EMERGENCY_VEHICLE', latitude: 28.6300, longitude: 77.2400, capacity: 6 },
      { resourceCode: 'MS01', name: 'Medical Supply Cache 01', type: 'MEDICAL_SUPPLY', latitude: 28.6120, longitude: 77.2080, capacity: 100 },
      { resourceCode: 'FS01', name: 'Food Supply Cache 01', type: 'FOOD_SUPPLY', latitude: 28.6170, longitude: 77.2170, capacity: 200 },
      { resourceCode: 'WS01', name: 'Water Supply Cache 01', type: 'WATER_SUPPLY', latitude: 28.6190, longitude: 77.2190, capacity: 200 },
    ]
    for (const r of resources) {
      await db.resource.create({ data: { ...r, status: 'AVAILABLE' } })
    }
  }

  return ok({
    ok: true,
    users: createdUsers.map((u) => ({ id: u.id, email: u.email, role: u.role })),
    message: 'Seed complete. Demo accounts: admin@/officer@/responder@/citizen@resourceflow.ai — password: demo1234',
  })
}
