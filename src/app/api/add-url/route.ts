import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { url, name, type } = await req.json()
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }
    const resolvedType = type || (url.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i) ? 'audio' : 'video')
    const fileName = name || url.split('/').pop() || 'External Media'

    const media = await db.mediaFile.create({
      data: {
        name: fileName,
        filename: url,
        filePath: url,
        size: 0,
        mimeType: 'application/octet-stream',
        type: resolvedType,
      },
    })

    return NextResponse.json({
      file: {
        id: media.id,
        name: media.name,
        url: media.filePath,
        type: media.type,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
