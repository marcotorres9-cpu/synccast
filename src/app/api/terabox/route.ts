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
    const { url, name } = await req.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Check if it's a Terabox SHARE URL
    const isTeraboxShare = url.includes('terabox.com/s/') || url.includes('1024terabox.com/s/')
    
    if (isTeraboxShare) {
      return NextResponse.json({
        error: 'Los enlaces de Terabox no se pueden reproducir directamente. Necesitas el enlace de descarga directa.'
      }, { status: 400 })
    }

    // Handle Google Drive URLs - convert to direct download
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
      const match = url.match(/[/d=]([a-zA-Z0-9_-]{25,})/)
      if (match) {
        const fileId = match[1]
        const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
        const fileName = name || `Video de Google Drive`
        
        const media = await db.mediaFile.create({
          data: {
            name: fileName,
            filename: directUrl,
            filePath: directUrl,
            size: 0,
            mimeType: 'video/mp4',
            type: 'video',
          },
        })
        
        return NextResponse.json({
          file: {
            id: media.id,
            name: media.name,
            url: media.filePath,
            type: 'video',
          },
        })
      }
    }

    // For any other URL, save it directly
    const isDirectVideo = url.match(/\.(mp4|webm|mkv|mov|m4v)/i)
    const resolvedType = isDirectVideo ? 'video' : 'video'
    const fileName = name || url.split('/').pop()?.split('?')[0] || 'Video Externo'
    
    const media = await db.mediaFile.create({
      data: {
        name: fileName,
        filename: url,
        filePath: url,
        size: 0,
        mimeType: 'video/mp4',
        type: resolvedType,
      },
    })
    
    return NextResponse.json({
      file: {
        id: media.id,
        name: media.name,
        url: media.filePath,
        type: 'video',
      },
    })
  } catch (e: any) {
    console.error('URL save error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
