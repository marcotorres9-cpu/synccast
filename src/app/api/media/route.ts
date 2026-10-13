import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const media = await db.mediaFile.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({
      files: media.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.filePath,
        type: m.type,
        size: m.size,
        duration: m.duration,
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
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }
    await db.mediaFile.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
