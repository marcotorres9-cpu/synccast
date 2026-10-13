import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const type = (formData.get('type') as string) || 'video'

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    const savedFiles = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = path.extname(file.name)
      const baseName = path.basename(file.name, ext)
      const uniqueName = `${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
      const filePath = path.join(uploadsDir, uniqueName)

      await writeFile(filePath, buffer)

      let resolvedType = type
      if (file.type.startsWith('video/')) resolvedType = 'video'
      else if (file.type.startsWith('audio/')) resolvedType = 'audio'

      const media = await db.mediaFile.create({
        data: {
          name: file.name,
          filename: uniqueName,
          filePath: `/uploads/${uniqueName}`,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          type: resolvedType,
        },
      })

      savedFiles.push({
        id: media.id,
        name: media.name,
        url: media.filePath,
        type: media.type,
        size: media.size,
      })
    }

    return NextResponse.json({ files: savedFiles })
  } catch (e: any) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e.message || 'Upload failed' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const media = await db.mediaFile.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({
      files: media.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.filePath,
        type: m.type,
        size: m.size,
        duration: m.duration,
        createdAt: m.createdAt,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
