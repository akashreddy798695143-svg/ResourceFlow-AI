import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleAuthError } from '@/lib/auth'
import { ok, err } from '@/lib/api'
import { participantIn } from '@/lib/chat'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const conversationId = formData.get('conversationId') as string | null

    if (!file || !file.size) {
      return err('No file provided', 400)
    }

    if (!conversationId) {
      return err('conversationId is required', 400)
    }

    const conversation = await db.chatConversation.findUnique({
      where: { id: conversationId },
      select: { participantA: true, participantB: true },
    })

    if (!conversation || !participantIn(conversation, user.id)) {
      return err('Forbidden', 403)
    }

    const mime = file.type || 'image/jpeg'
    if (!mime.startsWith('image/')) {
      return err('Only image files are allowed', 400)
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return err('File too large (max 10MB)', 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg'
    const filename = `${Date.now()}.${ext}`

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'chat-photos', user.id)
    await mkdir(uploadDir, { recursive: true })

    const filepath = join(uploadDir, filename)
    await writeFile(filepath, buffer)

    const url = `/uploads/chat-photos/${user.id}/${filename}`

    return ok({ url, filename, mime }, 201)
  } catch (e) {
    console.error('Photo upload error:', e)
    return err('Failed to upload photo', 500)
  }
}