"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Container } from "@/components/layout/container"
import { Section } from "@/components/layout/section"
import { SearchContentCard } from "@/components/ui/search-content-card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Home, Loader2 } from "lucide-react"
import { SearchResultsSkeleton } from "@/components/ui/content-skeleton"
import { useDebounce } from "@/hooks/use-debounce"
import { useNostrSearch } from "@/hooks/useNostrSearch"
import type { ContentItem } from '@/data/types'
import { cn } from "@/lib/utils"
import { copyConfig } from "@/lib/copy"
import contentConfig from "../../../config/content.json"

// Get search config with defaults
const searchConfig = (contentConfig as any).search || {}
const MIN_KEYWORD_LENGTH = searchConfig.minKeywordLength || 3

function SearchContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const searchCopy = copyConfig.search

  const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') || '')
  const [searchType, setSearchType] = useState<'all' | 'courses' | 'resources'>('all')
  
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  
  // Use Nostr search hook
  const {
    results: searchResults = [],
    isLoading,
    error,
    refetch
  } = useNostrSearch(debouncedSearchQuery, {
    enabled: debouncedSearchQuery.length >= MIN_KEYWORD_LENGTH,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
  
  // Transform search results to ContentItem format
  const contentItems = useMemo(() => {
    return searchResults.map(result => {
      const contentItem: ContentItem = {
        id: result.id,
        type: result.type === 'course' ? 'course' : (result.type === 'resource' ? 'document' : 'video'),
        title: result.title,
        description: result.description,
        category: result.isPremium ? 'Premium' : 'Free',
        image: result.image || '',
        tags: [],
        instructor: result.instructor || '',
        instructorPubkey: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        price: result.price || 0,
        isPremium: result.isPremium,
        rating: 4.5,
        published: true,
        topics: result.tags || [result.category || ''].filter(Boolean),
        additionalLinks: [],
        noteId: undefined,
        matchedFields: result.matchedFields,
      }
      return contentItem
    })
  }, [searchResults])

  // Filter results based on search type
  const filteredResults = useMemo(() => {
    if (searchType === 'all') return contentItems
    if (searchType === 'courses') return contentItems.filter(item => item.type === 'course')
    if (searchType === 'resources') return contentItems.filter(item => item.type === 'document' || item.type === 'video')
    return contentItems
  }, [contentItems, searchType])
  
  // Calculate summary stats
  const summary = useMemo(() => {
    const courses = contentItems.filter(item => item.type === 'course').length
    const resources = contentItems.filter(item => item.type === 'document' || item.type === 'video').length
    return { courses, resources, total: courses + resources }
  }, [contentItems])
  
  // Update URL when search query changes
  useEffect(() => {
    if (debouncedSearchQuery) {
      const params = new URLSearchParams(searchParams?.toString() || '')
      params.set('q', debouncedSearchQuery)
      router.push(`/search?${params.toString()}`, { scroll: false })
    }
  }, [debouncedSearchQuery, router, searchParams])
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (debouncedSearchQuery.length >= MIN_KEYWORD_LENGTH) {
      refetch()
    }
  }
  
  return (
    <Container className="py-8">
      <Section>
        <div className="space-y-6">
          {/* Home Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>

          {/* Search Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">{searchCopy?.title ?? "Search Content"}</h1>
            <p className="text-muted-foreground">
              {searchCopy?.description ?? "Search courses and resources from Nostr relays"}
            </p>
          </div>
          
          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className={cn(
                "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
                searchQuery.length >= MIN_KEYWORD_LENGTH ? "text-primary" : "text-muted-foreground"
              )} />
              <Input
                type="search"
                placeholder={searchCopy?.inputPlaceholder ?? `Search Nostr content... (min ${MIN_KEYWORD_LENGTH} characters)`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "pl-10 pr-4 h-12 text-lg transition-all duration-200",
                  searchQuery.length >= MIN_KEYWORD_LENGTH && "border-primary/50 ring-1 ring-primary/20",
                  isLoading && "animate-pulse"
                )}
                autoFocus
              />
              
              {/* Loading indicator inside input */}
              {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          </form>
          
          {/* Search Type Tabs */}
              {searchQuery.length >= MIN_KEYWORD_LENGTH && (
            <div className="max-w-2xl mx-auto">
              <Tabs value={searchType} onValueChange={(value) => setSearchType(value as 'all' | 'courses' | 'resources')}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all" className="cursor-pointer">
                    {(searchCopy?.tabs?.all ?? "All")} {summary && `(${summary.total})`}
                  </TabsTrigger>
                  <TabsTrigger value="courses" className="cursor-pointer">
                    {(searchCopy?.tabs?.courses ?? "Courses")} {summary && `(${summary.courses})`}
                  </TabsTrigger>
                  <TabsTrigger value="resources" className="cursor-pointer">
                    {(searchCopy?.tabs?.resources ?? "Resources")} {summary && `(${summary.resources})`}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          
          {/* Search Results */}
          <div className="mt-8">
            {searchQuery.length > 0 && searchQuery.length < MIN_KEYWORD_LENGTH && (
              <p className="text-center text-muted-foreground">
                {searchCopy?.emptyPrompt ?? `Please enter at least ${MIN_KEYWORD_LENGTH} characters to search`}
              </p>
            )}
            
            {error && (
              <p className="text-center text-destructive">
                {error instanceof Error ? error.message : (searchCopy?.error ?? "Failed to search. Please try again.")}
              </p>
            )}
            
            {isLoading && (
              <SearchResultsSkeleton count={4} />
            )}
            
            {!isLoading && filteredResults.length > 0 && (
              <>
                {/* Search Results Summary */}
                <div className="text-center mb-6">
                  <p className="text-muted-foreground">
                    {(searchCopy?.summary?.prefix ?? "Found")} {filteredResults.length} {filteredResults.length === 1 ? (searchCopy?.summary?.resultSingular ?? "result") : (searchCopy?.summary?.resultPlural ?? "results")} {(searchCopy?.summary?.for ?? "for")}{' '}
                    <span className="inline-block bg-primary/10 text-primary px-2 py-1 rounded font-medium">
                      &quot;{searchQuery}&quot;
                    </span>
                  </p>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-1">
                  {filteredResults.map((item) => (
                    <SearchContentCard
                      key={item.id}
                      item={item}
                      searchKeyword={searchQuery}
                      onTagClick={(tag) => {
                        // Handle tag click for filtering if needed
                        console.log('Tag clicked:', tag)
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            
            {!isLoading && searchQuery.length >= MIN_KEYWORD_LENGTH && filteredResults.length === 0 && !error && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No results found for &quot;{searchQuery}&quot; on Nostr relays
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Try searching with different keywords or check relay connectivity
                </p>
              </div>
            )}
          </div>
        </div>
      </Section>
    </Container>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <Container className="py-8">
        <Section>
          <div className="space-y-6">
            <div className="h-9 w-16" /> {/* Back button placeholder */}
            <div className="text-center space-y-2">
              <div className="h-9 w-48 mx-auto rounded bg-muted animate-pulse" />
              <div className="h-4 w-64 mx-auto rounded bg-muted animate-pulse" />
            </div>
            <div className="max-w-2xl mx-auto">
              <div className="h-12 w-full rounded bg-muted animate-pulse" />
            </div>
            <div className="mt-8">
              <SearchResultsSkeleton count={4} />
            </div>
          </div>
        </Section>
      </Container>
    }>
      <SearchContent />
    </Suspense>
  )
}
