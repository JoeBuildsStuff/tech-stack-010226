'use client'

import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ImageIcon, AlertCircle } from 'lucide-react'
import Spinner from '@/components/ui/spinner'

export const CustomImageView = ({ node, selected, updateAttributes }: ReactNodeViewProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startWidth, setStartWidth] = useState(0)
  const [localWidth, setLocalWidth] = useState<number | null>(null)
  
  const imageRef = useRef<HTMLImageElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const src = node.attrs.src
  const width = localWidth !== null ? localWidth : (node.attrs.width || 'auto')
  const height = node.attrs.height || 'auto'

  // Keep local width in sync with node attrs so persisted values restore on refresh.
  useEffect(() => {
    if (typeof node.attrs.width === 'number') {
      setLocalWidth(node.attrs.width)
      return
    }

    if (typeof node.attrs.width === 'string') {
      const parsed = parseInt(node.attrs.width, 10)
      if (!Number.isNaN(parsed)) {
        setLocalWidth(parsed)
      }
    }
  }, [node.attrs.width])

  useEffect(() => {
    const fetchImageUrl = async () => {
      if (!src) {
        setError('No image source provided')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        
        // If it's already a full URL, use it directly
        if (src.startsWith('http')) {
          setImageUrl(src)
          setIsLoading(false)
          return
        }
        
        // For file paths, use our unified file API
        const apiUrl = `/api/files/serve?path=${encodeURIComponent(src)}`
        
        const response = await fetch(apiUrl)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`Failed to fetch file: ${response.status} - ${errorData.error || 'Unknown error'}`)
        }
        
        const data = await response.json()
        if (data.fileUrl) {
          setImageUrl(data.fileUrl)
        } else {
          throw new Error('Invalid response from file API')
        }
        
        setIsLoading(false)
      } catch (err) {
        console.error('Error fetching image URL:', err)
        setError(err instanceof Error ? err.message : 'Failed to load image')
        setIsLoading(false)
      }
    }

    fetchImageUrl()
  }, [src])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    setStartX(e.clientX)
    if (imageRef.current) {
      setStartWidth(imageRef.current.offsetWidth)
    }
  }, [])

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !imageRef.current) return
    
    const deltaX = e.clientX - startX
    const newWidth = Math.max(100, startWidth + deltaX) // Minimum 100px width
    
    // Update local state for immediate visual feedback
    setLocalWidth(newWidth)
    
    // Update the DOM directly for smooth resizing
    if (imageRef.current) {
      imageRef.current.style.width = `${newWidth}px`
    }
  }, [isResizing, startX, startWidth])

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
    if (localWidth !== null) {
      updateAttributes({ width: Math.round(localWidth) })
    }
  }, [localWidth, updateAttributes])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
      
      return () => {
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
      }
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  if (isLoading) {
    return (
      <NodeViewWrapper>
        <div className="flex items-center justify-center p-8 bg-muted rounded-lg">
          <div className="text-center flex flex-col items-center">
          <Spinner className="stroke-neutral-400 stroke-5"/>
            <p className="text-sm text-muted-foreground">Loading image...</p>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  if (error) {
    return (
      <NodeViewWrapper>
        <div className="flex items-center justify-center p-8 bg-muted rounded-lg">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load image</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  if (!imageUrl) {
    return (
      <NodeViewWrapper>
        <div className="flex items-center justify-center p-8 bg-muted rounded-lg">
          <div className="text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No image available</p>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="block">
      <div ref={wrapperRef} className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={imageUrl}
          alt=""
          className={`max-w-full h-auto rounded-lg ${selected ? 'ring-1 ring-foreground ring-offset-4 ring-offset-background ' : ''}`}
          style={{ 
            width: typeof width === 'number' ? `${width}px` : width,
            height: typeof height === 'number' ? `${height}px` : height
          }}
        />
        
        {/* Resize handles - only show when selected */}
        {selected && (
          <>
            {/* Left handle */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-4 h-8 cursor-ew-resize bg-foreground/20 hover:bg-foreground/40 rounded-full flex items-center justify-center"
              onMouseDown={handleResizeStart}
              style={{ cursor: 'ew-resize' }}
            >
              <div className="w-1 h-4 bg-foreground/60 rounded-full" />
            </div>
            
            {/* Right handle */}
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-4 h-8 cursor-ew-resize bg-foreground/20 hover:bg-foreground/40 rounded-full flex items-center justify-center"
              onMouseDown={handleResizeStart}
              style={{ cursor: 'ew-resize' }}
            >
              <div className="w-1 h-4 bg-foreground/60 rounded-full" />
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}
