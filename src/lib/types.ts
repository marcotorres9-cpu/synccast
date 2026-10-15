export type MediaType = 'video' | 'audio' | 'youtube'

export interface MediaItem {
  id: string
  name: string
  url: string
  type: MediaType
  duration: number
  size: number
  youtubeId?: string
}

export interface Playlist {
  id: string
  name: string
  type: MediaType
  items: MediaItem[]
  createdAt: string
}

export interface TVInfo {
  tvId: string
  name: string
  isOnline: boolean
  volume: number
  lastSeen: number
}

export interface PlaybackState {
  mediaId: string | null
  mediaType: MediaType | null
  mediaName: string | null
  mediaUrl: string | null
  youtubeId?: string | null
  isPlaying: boolean
  position: number
  duration: number
  targetPlayAt: number | null
  targetPosition: number
  playlistId: string | null
  playlistIndex: number
  playlist: MediaItem[]
}

export type CommandAction =
  | 'load-playlist'
  | 'play'
  | 'pause'
  | 'seek'
  | 'next'
  | 'previous'
  | 'stop'
  | 'set-volume'
  | 'rename-tv'
  | 'kick-tv'

export interface CommandPayload {
  playlist?: MediaItem[]
  playlistId?: string
  startIndex?: number
  position?: number
  tvId?: string
  volume?: number
  name?: string
}
