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

// Extract YouTube video ID from URL
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^[a-zA-Z0-9_-]{11}$/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Get video info via oEmbed
async function getYouTubeInfo(videoId: string): Promise<{ title: string }> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    if (response.ok) {
      const data = await response.json()
      return { title: data.title || `YouTube Video ${videoId}` }
    }
  } catch {}
  return { title: `YouTube Video ${videoId}` }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    const videoId = extractYouTubeId(url)
    if (!videoId) {
      return NextResponse.json({ error: 'URL de YouTube inválida' }, { status: 400 })
    }

    const info = await getYouTubeInfo(videoId)

    // Use Cobalt API to get the direct MP4 download URL
    // Cobalt is a free, open-source media downloader
    const cobaltResponse = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        vQuality: '720', // 720p is good enough for TVs and loads fast
      }),
    })

    if (!cobaltResponse.ok) {
      // If Cobalt fails, save as YouTube link (will use redirect approach)
      const media = await db.mediaFile.create({
        data: {
          name: info.title,
          filename: videoId,
          filePath: `https://www.youtube.com/watch?v=${videoId}`,
          size: 0,
          mimeType: 'video/youtube',
          type: 'youtube',
          youtubeId: videoId,
        },
      })
      return NextResponse.json({
        file: {
          id: media.id,
          name: media.name,
          url: media.filePath,
          type: 'youtube',
          youtubeId: videoId,
          note: 'No se pudo descargar como MP4. Se guardó como enlace de YouTube.'
        }
      })
    }

    const cobaltData = await cobaltResponse.json()

    if (cobaltData.status === 'stream' || cobaltData.status === 'redirect') {
      // We got a direct MP4 URL
      const mp4Url = cobaltData.url

      const media = await db.mediaFile.create({
        data: {
          name: info.title,
          filename: videoId,
          filePath: mp4Url,
          size: 0,
          mimeType: 'video/mp4',
          type: 'video', // Store as regular video (not youtube)
          youtubeId: videoId,
        },
      })

      return NextResponse.json({
        file: {
          id: media.id,
          name: media.name,
          url: mp4Url,
          type: 'video',
          youtubeId: videoId,
          note: 'Video descargado como MP4. Se reproducirá en todas las TVs.'
        }
      })
    } else {
      // Cobalt couldn't process it, save as YouTube link
      const media = await db.mediaFile.create({
        data: {
          name: info.title,
          filename: videoId,
          filePath: `https://www.youtube.com/watch?v=${videoId}`,
          size: 0,
          mimeType: 'video/youtube',
          type: 'youtube',
          youtubeId: videoId,
        },
      })
      return NextResponse.json({
        file: {
          id: media.id,
          name: media.name,
          url: media.filePath,
          type: 'youtube',
          youtubeId: videoId,
          note: 'No se pudo descargar como MP4. Se guardó como enlace de YouTube.'
        }
      })
    }
  } catch (e: any) {
    console.error('YouTube download error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
