'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  FileText,
  Video,
  Plus,
  Search,
  Loader2,
  Check,
  ImageOff
} from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { useDocumentsQuery } from '@/hooks/useDocumentsQuery'
import { useVideosQuery } from '@/hooks/useVideosQuery'
import { useDraftsQuery } from '@/hooks/useDraftsQuery'
import { parseEvent } from '@/data/types'

interface LessonData {
  id: string
  type: 'resource' | 'draft'
  resourceId?: string
  draftId?: string
  title: string
  contentType?: string
  price?: number
  image?: string
  summary?: string
}

interface LessonSelectorProps {
  onAddLessons: (lessons: LessonData[]) => void
  existingLessons: LessonData[]
  priceFilter: 'paid' | 'free'
}

export default function LessonSelector({ onAddLessons, existingLessons, priceFilter }: LessonSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLessons, setSelectedLessons] = useState<LessonData[]>([])
  
  // Fetch published resources
  const { documents, isLoading: isLoadingDocs } = useDocumentsQuery({
    includeLessonResources: true,
  })
  const { videos, isLoading: isLoadingVideos } = useVideosQuery({
    includeLessonResources: true,
  })
  const { drafts, isLoading: isLoadingDrafts } = useDraftsQuery()
  
  // Combine and filter published resources
  const publishedResources = [...documents, ...videos]
    .map(resource => {
      if (!resource.note) return null
      const parsedData = parseEvent(resource.note)
      return {
        id: `resource-${resource.id}`,
        type: 'resource' as const,
        resourceId: resource.id,
        title: parsedData?.title || 'Untitled',
        contentType: parsedData?.type,
        price: resource.price,
        image: parsedData?.image,
        summary: parsedData?.summary
      }
    })
    .filter(Boolean) as LessonData[]
  
  // Filter draft resources
  const draftResources = (drafts || [])
    .filter(draft => draft.type === 'document' || draft.type === 'video')
    .map(draft => ({
      id: `draft-${draft.id}`,
      type: 'draft' as const,
      draftId: draft.id,
      title: draft.title,
      contentType: draft.type,
      price: draft.price || 0,
      image: draft.image || undefined,
      summary: draft.summary
    }))
  
  // Filter resources based on search and existing lessons
  const matchesPriceFilter = (price?: number) => {
    const sats = typeof price === 'number' && !Number.isNaN(price) ? price : 0
    return priceFilter === 'paid' ? sats > 0 : sats <= 0
  }

  const filteredPublished = publishedResources.filter(resource => {
    const matchesSearch = resource.title.toLowerCase().includes(searchTerm.toLowerCase())
    const notAlreadyAdded = !existingLessons.some(lesson => 
      lesson.resourceId === resource.resourceId
    )
    const notSelected = !selectedLessons.some(lesson => 
      lesson.resourceId === resource.resourceId
    )
    return matchesSearch && notAlreadyAdded && notSelected && matchesPriceFilter(resource.price)
  })
  
  const filteredDrafts = draftResources.filter(draft => {
    const matchesSearch = draft.title.toLowerCase().includes(searchTerm.toLowerCase())
    const notAlreadyAdded = !existingLessons.some(lesson => 
      lesson.draftId === draft.draftId
    )
    const notSelected = !selectedLessons.some(lesson => 
      lesson.draftId === draft.draftId
    )
    return matchesSearch && notAlreadyAdded && notSelected && matchesPriceFilter(draft.price)
  })
  
  const isLoading = isLoadingDocs || isLoadingVideos || isLoadingDrafts
  
  const handleSelectResource = (resource: LessonData) => {
    const isSelected = selectedLessons.some(lesson => 
      (resource.resourceId && lesson.resourceId === resource.resourceId) ||
      (resource.draftId && lesson.draftId === resource.draftId)
    )
    
    if (isSelected) {
      setSelectedLessons(selectedLessons.filter(lesson => 
        !(resource.resourceId && lesson.resourceId === resource.resourceId) &&
        !(resource.draftId && lesson.draftId === resource.draftId)
      ))
    } else {
      setSelectedLessons([...selectedLessons, resource])
    }
  }
  
  const handleAddSelected = () => {
    onAddLessons(selectedLessons)
    setSelectedLessons([])
    setIsOpen(false)
    setSearchTerm('')
  }
  
  const renderResourceCard = (resource: LessonData) => {
    const isSelected = selectedLessons.some(lesson => 
      (resource.resourceId && lesson.resourceId === resource.resourceId) ||
      (resource.draftId && lesson.draftId === resource.draftId)
    )
    
    return (
      <Card 
        key={resource.id}
        className={`cursor-pointer transition-all overflow-hidden ${
          isSelected ? 'ring-2 ring-primary' : 'hover:border-foreground/20'
        }`}
        onClick={() => handleSelectResource(resource)}
      >
        <CardContent className="p-0">
          <div className="flex gap-4">
            {/* Image Section */}
            <div className="relative w-32 h-24 bg-muted flex-shrink-0">
              {resource.image ? (
                <OptimizedImage
                  src={resource.image}
                  alt={resource.title}
                  fill
                  className="object-cover"
                  sizes="128px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  {resource.contentType === 'video' ? (
                    <Video className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              )}
              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <div className="bg-primary text-primary-foreground rounded-full p-1">
                    <Check className="h-5 w-5" />
                  </div>
                </div>
              )}
            </div>
            
            {/* Content Section */}
            <div className="flex-1 p-3 min-w-0">
              <div className="space-y-2">
                <h4 className="font-medium text-sm line-clamp-1">{resource.title}</h4>
                {resource.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {resource.summary}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="secondary" 
                    className="text-xs capitalize"
                  >
                    {resource.contentType || 'Document'}
                  </Badge>
                  {resource.type === 'draft' && (
                    <Badge variant="outline" className="text-xs">
                      Draft
                    </Badge>
                  )}
                  {typeof resource.price === 'number' && resource.price > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-xs flex items-center gap-1 bg-primary/10 text-primary border border-primary/30"
                    >
                      {resource.price.toLocaleString()} sats
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Lessons
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Lessons</DialogTitle>
          <DialogDescription>
            Choose resources to add as lessons to your course
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search resources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Tabs defaultValue="published" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="published">Published Resources</TabsTrigger>
              <TabsTrigger value="drafts">Draft Resources</TabsTrigger>
            </TabsList>
            
            <TabsContent value="published" className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2 text-muted-foreground">Loading resources...</span>
                </div>
              ) : filteredPublished.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No resources match your search' : 'No published resources available'}
                </div>
              ) : (
                <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {filteredPublished.map(renderResourceCard)}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="drafts" className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2 text-muted-foreground">Loading drafts...</span>
                </div>
              ) : filteredDrafts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No drafts match your search' : 'No draft resources available'}
                </div>
              ) : (
                <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {filteredDrafts.map(renderResourceCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          {selectedLessons.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {selectedLessons.length} lesson{selectedLessons.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedLessons([])
                    setIsOpen(false)
                    setSearchTerm('')
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddSelected}>
                  Add Selected
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
