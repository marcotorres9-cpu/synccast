import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'


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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Extract YouTube video ID from various URL formats
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^[a-zA-Z0-9_-]{11}$/ // Direct ID
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Get video info via oEmbed (no API key needed)
async function getYouTubeInfo(videoId: string): Promise<{ title: string; duration: number }> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    if (response.ok) {
      const data = await response.json()
      return { title: data.title || `YouTube Video ${videoId}`, duration: 0 }
    }
  } catch {}
  return { title: `YouTube Video ${videoId}`, duration: 0 }
}

export async function POST(req: NextRequest) {
  try {
    const { url, name } = await req.json()
    const videoId = extractYouTubeId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'URL de YouTube inválida' }, { status: 400 })
    }

    const info = await getYouTubeInfo(videoId)
    const media = await db.mediaFile.create({
      data: {
        name: name || info.title,
        filename: videoId,
        filePath: `https://www.youtube.com/watch?v=${videoId}`,
        size: 0,
        mimeType: 'video/youtube',
        type: 'youtube',
        youtubeId: videoId,
        duration: info.duration || null,
      },
    })

    return NextResponse.json({
      file: {
        id: media.id,
        name: media.name,
        url: media.filePath,
        type: media.type,
        youtubeId: videoId,
      },
    })
  } catch (e: any) {
    console.error('YouTube save error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const media = await db.mediaFile.findMany({
      where: { type: 'youtube' },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({
      files: media.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.filePath,
        type: m.type,
        youtubeId: m.youtubeId,
        createdAt: m.createdAt,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await db.mediaFile.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
