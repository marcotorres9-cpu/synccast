/**
 * Client-side video compression using ffmpeg.wasm
 * Compresses videos to under 80MB before uploading to Cloudinary
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

let ffmpegInstance: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance
  
  ffmpegInstance = new FFmpeg()
  
  // Load ffmpeg.wasm core
  // Use unpkg CDN for the core files
  await ffmpegInstance.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
  })
  
  return ffmpegInstance
}

export interface CompressionResult {
  blob: Blob
  size: number
  compressed: boolean
  originalSize: number
}

export async function compressVideo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<CompressionResult> {
  const originalSize = file.size
  
  // If already under 80MB, no need to compress
  if (originalSize < 80 * 1024 * 1024) {
    return {
      blob: file,
      size: originalSize,
      compressed: false,
      originalSize,
    }
  }
  
  // Need to compress - target ~70MB output
  // Calculate bitrate based on target size and estimated duration
  // bitrate = (target_size_bits) / (duration_seconds)
  // We'll use a fixed quality that produces ~70MB for a typical video
  
  try {
    onProgress?.(0)
    
    const ffmpeg = await getFFmpeg()
    
    // Listen for progress
    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      onProgress?.(Math.round(progress * 100))
    })
    
    // Write input file
    const inputName = 'input.mp4'
    const outputName = 'output.mp4'
    
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    
    // Compress with ffmpeg
    // Scale to 1080p max, use H.264, target ~70MB
    // CRF 28 is a good balance between quality and size
    await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '28',
      '-vf', 'scale=-2:1080',  // Scale to 1080p, keep aspect ratio
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ])
    
    // Read output
    const data = await ffmpeg.readFile(outputName)
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' })
    
    // Cleanup
    await ffmpeg.deleteFile(inputName)
    await ffmpeg.deleteFile(outputName)
    
    onProgress?.(100)
    
    return {
      blob,
      size: blob.size,
      compressed: true,
      originalSize,
    }
  } catch (e: any) {
    console.error('Compression failed:', e)
    // If compression fails, return original file
    return {
      blob: file,
      size: originalSize,
      compressed: false,
      originalSize,
    }
  }
}
