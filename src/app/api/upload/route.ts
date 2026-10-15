import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET

async function uploadToCloudinary(file: File): Promise<any> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary credentials not configured')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4'
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const publicId = `synccast/${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const isVideo = file.type.startsWith('video/') || ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v'].includes(ext)
  const isAudio = file.type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)
  const resourceType = isVideo ? 'video' : isAudio ? 'audio' : 'auto'

  const timestamp = Math.floor(Date.now() / 1000)
  const crypto = await import('crypto')
  const signatureParams = `public_id=${publicId}&timestamp=${timestamp}&resource_type=${resourceType}`
  const signature = crypto.createHash('sha1').update(signatureParams + CLOUDINARY_API_SECRET).digest('hex')

  const formData = new FormData()
  formData.append('file', new Blob([buffer]), file.name)
  formData.append('public_id', publicId)
  formData.append('timestamp', timestamp.toString())
  formData.append('api_key', CLOUDINARY_API_KEY)
  formData.append('signature', signature)
  formData.append('resource_type', resourceType)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: formData }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cloudinary upload failed: ${response.status} ${text}`)
  }
  return await response.json()
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const type = (formData.get('type') as string) || 'video'

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const savedFiles = []
    const useCloudinary = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)

    for (const file of files) {
      let resolvedType = type
      if (file.type.startsWith('video/')) resolvedType = 'video'
      else if (file.type.startsWith('audio/')) resolvedType = 'audio'

      let mediaUrl: string
      let mediaSize = file.size
      let mediaDuration: number | null = null
      let mediaFilename: string

      if (useCloudinary) {
        const result = await uploadToCloudinary(file)
        mediaUrl = result.secure_url
        mediaFilename = result.public_id
        mediaSize = result.bytes
        mediaDuration = result.duration || null
      } else {
        // Fallback: local fs (works in dev only)
        const { writeFile, mkdir } = await import('fs/promises')
        const { existsSync } = await import('fs')
        const path = await import('path')
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
        if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true })
        const buffer = Buffer.from(await file.arrayBuffer())
        const ext = path.extname(file.name)
        const baseName = path.basename(file.name, ext)
        const uniqueName = `${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
        await writeFile(path.join(uploadsDir, uniqueName), buffer)
        mediaUrl = `/uploads/${uniqueName}`
        mediaFilename = uniqueName
      }

      const media = await db.mediaFile.create({
        data: {
          name: file.name,
          filename: mediaFilename,
          filePath: mediaUrl,
          size: mediaSize,
          mimeType: file.type || 'application/octet-stream',
          type: resolvedType,
          duration: mediaDuration,
        },
      })

      savedFiles.push({
        id: media.id,
        name: media.name,
        url: media.filePath,
        type: media.type,
        size: media.size,
        duration: media.duration,
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
    const media = await db.mediaFile.findMany({ orderBy: { createdAt: 'desc' } })
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
