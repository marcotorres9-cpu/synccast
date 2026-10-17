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

    // Check if it's a Terabox SHARE URL (not a direct download link)
    const isTeraboxShare = (url.includes('terabox.com/s/') || url.includes('1024terabox.com/s/'))
    
    if (isTeraboxShare) {
      // Terabox share URLs cannot be extracted server-side without authentication
      // The user needs to get the DIRECT download link instead
      
      return NextResponse.json({
        error: 'Los enlaces de Terabox (terabox.com/s/...) no se pueden reproducir directamente. Para usar un video de Terabox: 1) Abre el enlace en tu navegador 2) Toca "Download" 3) Copia el enlace directo que termina en .mp4 4) Pega ese enlace aquí'
      }, { status: 400 })
    }
    
    // If it's a Google Drive URL (any format), convert and save
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
      // Extract file ID
      const match = url.match(/[/d=]([a-zA-Z0-9_-]{25,})/)
      if (match) {
        const fileId = match[1]
        // Use the direct download URL that returns video/mp4
        const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
        const fileName = name || `Video de Google Drive (${fileId.substring(0, 8)}...)`
        
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
      const fileName = name || 'Video de Google Drive'
      
      const media = await db.mediaFile.create({
        data: {
          name: fileName,
          filename: url,
          filePath: url,
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
    
    // If it's a direct .mp4 URL (from Terabox download or anywhere else), save it
    const isDirectVideo = url.match(/\.(mp4|webm|mkv|mov|m4v)(\?|$)/i)
    
    if (isDirectVideo || url.includes('d.terabox.com') || url.includes('d-aa') || url.includes('download')) {
      const fileName = name || url.split('/').pop()?.split('?')[0] || 'Video Externo'
      
      const media = await db.mediaFile.create({
        data: {
          name: fileName,
          filename: url,
          filePath: url,
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
    
    // For any other URL, try to save it (might work for Google Drive, etc.)
    const resolvedType = url.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i) ? 'audio' : 'video'
    const fileName = name || url.split('/').pop()?.split('?')[0] || 'Video Externo'
    
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
    console.error('URL save error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
