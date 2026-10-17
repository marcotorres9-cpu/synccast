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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const type = (formData.get('type') as string) || 'video'
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME
    const API_KEY = process.env.CLOUDINARY_API_KEY
    const API_SECRET = process.env.CLOUDINARY_API_SECRET

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 })
    }

    let resolvedType = type
    if (file.type.startsWith('video/')) resolvedType = 'video'
    else if (file.type.startsWith('audio/')) resolvedType = 'audio'
    const resourceType = resolvedType === 'audio' ? 'audio' : 'video'
    
    const buffer = Buffer.from(await file.arrayBuffer())
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    const publicId = `synccast/${baseName}_${Date.now()}`
    const timestamp = Math.floor(Date.now() / 1000)
    
    const crypto = await import('crypto')
    const signatureParams = `public_id=${publicId}&timestamp=${timestamp}`
    const signature = crypto.createHash('sha1').update(signatureParams + API_SECRET).digest('hex')
    
    const cloudFormData = new FormData()
    cloudFormData.append('file', new Blob([buffer]), file.name)
    cloudFormData.append('public_id', publicId)
    cloudFormData.append('timestamp', timestamp.toString())
    cloudFormData.append('api_key', API_KEY)
    cloudFormData.append('signature', signature)

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      { method: 'POST', body: cloudFormData }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ 
        error: `Cloudinary: ${response.status} ${errorText.substring(0, 200)}` 
      }, { status: 500 })
    }

    const result = await response.json()
    
    const media = await db.mediaFile.create({
      data: {
        name: file.name,
        filename: result.public_id,
        filePath: result.secure_url,
        size: result.bytes,
        mimeType: file.type || 'application/octet-stream',
        type: resolvedType,
        duration: result.duration || null,
      },
    })

    return NextResponse.json({
      files: [{
        id: media.id,
        name: media.name,
        url: media.filePath,
        type: media.type,
        size: media.size,
        duration: media.duration,
      }]
    })
  } catch (e: any) {
    console.error('Upload proxy error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
