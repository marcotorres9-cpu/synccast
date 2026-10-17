import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME
    const API_KEY = process.env.CLOUDINARY_API_KEY
    const API_SECRET = process.env.CLOUDINARY_API_SECRET

    // Handle Google Drive: download the video and re-upload to Cloudinary
    // This is necessary because Google Drive blocks cross-origin playback
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
      // Extract file ID
      const match = url.match(/[/d=]([a-zA-Z0-9_-]{25,})/)
      if (!match) {
        return NextResponse.json({ error: 'No se pudo extraer el ID del archivo de Google Drive' }, { status: 400 })
      }
      
      const fileId = match[1]
      const driveUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
      
      if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
        return NextResponse.json({ error: 'Cloudinary no configurado' }, { status: 500 })
      }

      // Step 1: Download the video from Google Drive
      const driveResponse = await fetch(driveUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      
      if (!driveResponse.ok) {
        return NextResponse.json({ 
          error: `No se pudo descargar de Google Drive: ${driveResponse.status}` 
        }, { status: 500 })
      }

      const videoBuffer = Buffer.from(await driveResponse.arrayBuffer())
      const contentType = driveResponse.headers.get('content-type') || 'video/mp4'
      
      // Check if it's actually a video (Google Drive might return HTML for large files)
      if (!contentType.includes('video') && !contentType.includes('application/octet-stream')) {
        return NextResponse.json({ 
          error: 'Google Drive no devolvió un video. El archivo debe ser público y compartido como "Cualquiera con el enlace".' 
        }, { status: 500 })
      }

      // Step 2: Upload to Cloudinary with signed upload (no 100MB limit)
      const publicId = `synccast/gdrive_${fileId.substring(0, 20)}_${Date.now()}`
      const timestamp = Math.floor(Date.now() / 1000)
      const crypto = await import('crypto')
      const signatureParams = `public_id=${publicId}&timestamp=${timestamp}`
      const signature = crypto.createHash('sha1').update(signatureParams + API_SECRET).digest('hex')

      const cloudFormData = new FormData()
      cloudFormData.append('file', new Blob([videoBuffer]), name || `gdrive_${fileId.substring(0, 8)}.mp4`)
      cloudFormData.append('public_id', publicId)
      cloudFormData.append('timestamp', timestamp.toString())
      cloudFormData.append('api_key', API_KEY)
      cloudFormData.append('signature', signature)

      const cloudResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
        { method: 'POST', body: cloudFormData }
      )

      if (!cloudResponse.ok) {
        const errText = await cloudResponse.text()
        return NextResponse.json({ 
          error: `Error subiendo a Cloudinary: ${errText.substring(0, 200)}` 
        }, { status: 500 })
      }

      const cloudResult = await cloudResponse.json()

      // Step 3: Save to database with Cloudinary URL
      const media = await db.mediaFile.create({
        data: {
          name: name || `Video de Google Drive`,
          filename: cloudResult.public_id,
          filePath: cloudResult.secure_url,
          size: cloudResult.bytes,
          mimeType: 'video/mp4',
          type: 'video',
          duration: cloudResult.duration || null,
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

    // Handle Terabox share URLs
    if (url.includes('terabox.com/s/') || url.includes('1024terabox.com/s/')) {
      return NextResponse.json({
        error: 'Los enlaces de Terabox no se pueden procesar automáticamente. Descarga el video y súbelo directamente.'
      }, { status: 400 })
    }

    // For direct .mp4 URLs, try to download and re-upload to Cloudinary
    // (this fixes CORS issues for all external URLs)
    if (url.match(/\.(mp4|webm|mkv|mov|m4v)/i)) {
      if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
        // If no Cloudinary, just save the URL directly
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
        return NextResponse.json({ file: { id: media.id, name: media.name, url: media.filePath, type: 'video' } })
      }

      // Download and re-upload to Cloudinary
      try {
        const extResponse = await fetch(url)
        if (extResponse.ok) {
          const extBuffer = Buffer.from(await extResponse.arrayBuffer())
          const extPublicId = `synccast/ext_${Date.now()}`
          const extTimestamp = Math.floor(Date.now() / 1000)
          const crypto = await import('crypto')
          const extSig = crypto.createHash('sha1').update(`public_id=${extPublicId}&timestamp=${extTimestamp}${API_SECRET}`).digest('hex')
          
          const extFormData = new FormData()
          extFormData.append('file', new Blob([extBuffer]), name || 'external.mp4')
          extFormData.append('public_id', extPublicId)
          extFormData.append('timestamp', extTimestamp.toString())
          extFormData.append('api_key', API_KEY)
          extFormData.append('signature', extSig)

          const extCloudRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`, { method: 'POST', body: extFormData })
          
          if (extCloudRes.ok) {
            const extResult = await extCloudRes.json()
            const fileName = name || url.split('/').pop()?.split('?')[0] || 'Video Externo'
            const media = await db.mediaFile.create({
              data: {
                name: fileName,
                filename: extResult.public_id,
                filePath: extResult.secure_url,
                size: extResult.bytes,
                mimeType: 'video/mp4',
                type: 'video',
                duration: extResult.duration || null,
              },
            })
            return NextResponse.json({ file: { id: media.id, name: media.name, url: media.filePath, type: 'video' } })
          }
        }
      } catch (e) {
        // If download fails, save URL directly
      }

      // Fallback: save URL directly
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
      return NextResponse.json({ file: { id: media.id, name: media.name, url: media.filePath, type: 'video' } })
    }

    // Default: save URL directly
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
    return NextResponse.json({ file: { id: media.id, name: media.name, url: media.filePath, type: 'video' } })
  } catch (e: any) {
    console.error('URL save error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
