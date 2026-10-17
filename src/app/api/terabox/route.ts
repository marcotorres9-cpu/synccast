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

// Extract the direct download URL from a Terabox share link
async function extractTeraboxDirectUrl(shareUrl: string): Promise<{ directUrl: string; fileName: string } | null> {
  try {
    // Extract the share key from the URL
    // Terabox URLs look like: https://1024terabox.com/s/1-ZD77PPGktrnDYoakx0jJg
    // or https://terabox.com/s/1-ZD77PPGktrnDYoakx0jJg
    const match = shareUrl.match(/terabox\.com\/s\/([a-zA-Z0-9_-]+)/i)
    if (!match) return null
    
    const shareKey = match[1]
    
    // Use the Terabox API to get the direct download link
    // The API endpoint returns JSON with the direct URL
    const apiUrl = `https://teraboxdown.com/api?url=https://terabox.com/s/${shareKey}`
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    
    if (!response.ok) return null
    
    const data = await response.json()
    
    if (data.direct_link || data.download_link) {
      const directUrl = data.direct_link || data.download_link
      const fileName = data.filename || data.name || `Terabox Video ${shareKey}`
      return { directUrl, fileName }
    }
    
    return null
  } catch (e) {
    console.error('Terabox extract error:', e)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url, name } = await req.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Check if it's a Terabox URL
    const isTerabox = url.includes('terabox.com') || url.includes('1024terabox.com')
    
    if (isTerabox) {
      // Extract direct download URL
      const result = await extractTeraboxDirectUrl(url)
      
      if (result) {
        // Save with the DIRECT URL (not the share URL)
        const media = await db.mediaFile.create({
          data: {
            name: name || result.fileName,
            filename: url,
            filePath: result.directUrl,
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
      } else {
        // If extraction fails, save the original URL and show a message
        return NextResponse.json({
          error: 'No se pudo extraer el enlace directo de Terabox. Asegúrate de que el enlace sea público y correcto.'
        }, { status: 400 })
      }
    }
    
    // For non-Terabox URLs, save directly
    const resolvedType = url.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i) ? 'audio' : 'video'
    const fileName = name || url.split('/').pop()?.split('?')[0] || 'External Media'
    
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
    console.error('Terabox save error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
