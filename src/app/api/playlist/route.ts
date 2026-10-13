import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { name, type, items } = await req.json()
    const playlist = await db.playlist.create({
      data: {
        name,
        type,
        items: JSON.stringify(items),
      },
    })
    return NextResponse.json({ playlist })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const playlists = await db.playlist.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        items: JSON.parse(p.items),
        createdAt: p.createdAt,
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
    await db.playlist.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
