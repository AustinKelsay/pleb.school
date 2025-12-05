/**
 * Resource actions component for sharing and accessing resources
 * Handles sharing, external links, and premium access
 */

'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Share2, ExternalLink, Download } from 'lucide-react'
import { ResourceDisplay } from '@/data/types'
import { type ResourceContent } from '@/lib/content-utils'
import { additionalLinkLabel } from '@/lib/additional-links'

interface ResourceActionsProps {
  resource: ResourceDisplay
  content: ResourceContent
}

/**
 * Resource actions component
 */
export function ResourceActions({ resource, content }: ResourceActionsProps) {
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: resource.title,
          text: resource.description,
          url: window.location.href,
        })
      } catch (error) {
        // Fallback to clipboard
        navigator.clipboard.writeText(window.location.href)
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
      >
        <Share2 className="h-4 w-4 mr-2" />
        Share
      </Button>
      
      {content?.additionalLinks && content.additionalLinks.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <a href={content.additionalLinks[0].url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            {additionalLinkLabel(content.additionalLinks[0])}
          </a>
        </Button>
      )}
      
      {resource.isPremium && (
        <Button
          variant="outline"
          size="sm"
          className="border-amber-500 text-amber-600 hover:bg-amber-50"
        >
          <Download className="h-4 w-4 mr-2" />
          Premium Access
        </Button>
      )}
    </div>
  )
} 
