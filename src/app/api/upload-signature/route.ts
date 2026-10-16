import { NextRequest, NextResponse } from 'next/server'

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
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME
    const API_KEY = process.env.CLOUDINARY_API_KEY
    const API_SECRET = process.env.CLOUDINARY_API_SECRET

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 })
    }

    const { fileName, fileType } = await req.json()

    // Determine resource type
    const isVideo = fileType?.startsWith('video/') || fileName?.match(/\.(mp4|webm|mkv|mov|avi|m4v)$/i)
    const isAudio = fileType?.startsWith('audio/') || fileName?.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)
    const resourceType = isVideo ? 'video' : isAudio ? 'audio' : 'auto'

    // Generate a unique public_id
    const baseName = fileName?.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'file'
    const publicId = `synccast/${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Create signature
    const timestamp = Math.floor(Date.now() / 1000)
    const crypto = await import('crypto')
    const signatureParams = `public_id=${publicId}&timestamp=${timestamp}`
    const signature = crypto.createHash('sha1').update(signatureParams + API_SECRET).digest('hex')

    return NextResponse.json({
      cloudName: CLOUD_NAME,
      apiKey: API_KEY,
      timestamp,
      signature,
      publicId,
      resourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
