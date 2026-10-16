import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { name, url, publicId, size, duration, type } = await req.json()

    // Determine type from name if not provided
    let resolvedType = type
    if (!resolvedType) {
      if (name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)) {
        resolvedType = 'audio'
      } else {
        resolvedType = 'video'
      }
    }

    const media = await db.mediaFile.create({
      data: {
        name,
        filename: publicId || url,
        filePath: url,
        size: size || 0,
        mimeType: resolvedType === 'audio' ? 'audio/mpeg' : 'video/mp4',
        type: resolvedType,
        duration: duration || null,
      },
    })

    return NextResponse.json({
      file: {
        id: media.id,
        name: media.name,
        url: media.filePath,
        type: media.type,
        size: media.size,
        duration: media.duration,
      },
    })
  } catch (e: any) {
    console.error('Save media error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
