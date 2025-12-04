"use client";

import { useVideosQuery, VideoResourceWithNote } from "@/hooks/useVideosQuery";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ContentCard } from "@/components/ui/content-card";
import { ContentCardSkeleton } from "@/components/ui/content-skeleton";
import { Section } from "@/components/layout";
import { useHomepageSectionConfig } from "@/hooks/useContentConfig";
import { applyContentFilters } from "@/lib/content-config";
import { tagsToAdditionalLinks } from "@/lib/additional-links";

/**
 * Client component for fetching and displaying video resources
 * Uses the useVideosQuery hook to fetch video resources with their Nostr notes
 */
export function VideosSection() {
  const { videos, isLoading, isError, error } = useVideosQuery();
  const sectionConfig = useHomepageSectionConfig('videos');
  
  // If section is disabled in config, don't render
  if (!sectionConfig?.enabled) {
    return null;
  }
  
  // Apply filters from configuration
  const filteredVideos = sectionConfig ? applyContentFilters(videos, sectionConfig.filters) : videos;

  if (isLoading) {
    return (
      <Section spacing="lg" className="bg-background">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">{sectionConfig?.title || 'Videos'}</h2>
            <p className="text-muted-foreground">
              {sectionConfig?.description || 'Video tutorials and workshops from Bitcoin developers and experts'}
            </p>
          </div>
          
          <Carousel 
            opts={{
              align: "start",
              loop: sectionConfig?.carousel.loop || false,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {/* Show 3 skeleton cards for loading state */}
              {[1, 2, 3].map((index) => (
                <CarouselItem key={index} className={`pl-2 md:pl-4 basis-full ${sectionConfig?.carousel.itemsPerView.tablet === 2 ? 'md:basis-1/2' : ''} ${sectionConfig?.carousel.itemsPerView.desktop === 3 ? 'lg:basis-1/3' : sectionConfig?.carousel.itemsPerView.desktop === 4 ? 'lg:basis-1/4' : 'lg:basis-1/2'}`}>
                  <ContentCardSkeleton />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-[-10px] translate-x-0 z-10 sm:-left-12 sm:translate-x-0" />
            <CarouselNext className="right-[-10px] translate-x-0 z-10 sm:-right-12 sm:translate-x-0" />
          </Carousel>
        </div>
      </Section>
    );
  }

  if (isError) {
    return (
      <Section spacing="lg" className="bg-background">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">{sectionConfig?.title || 'Videos'}</h2>
            <p className="text-muted-foreground">
              {sectionConfig?.description || 'Video tutorials and workshops from Bitcoin developers and experts'}
            </p>
          </div>
          
          <div className="text-center py-12">
            <p className="text-red-600">Error loading videos: {error?.message}</p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section spacing="lg" className="bg-background">
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Videos</h2>
          <p className="text-muted-foreground">
            Video tutorials and workshops from Bitcoin developers and experts
          </p>
        </div>
        
        {filteredVideos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No video resources available at the moment.</p>
          </div>
        ) : (
          <Carousel 
            opts={{
              align: "start",
              loop: sectionConfig?.carousel.loop || false,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {filteredVideos.map((video) => (
                <CarouselItem key={video.id} className={`pl-2 md:pl-4 basis-full ${sectionConfig?.carousel.itemsPerView.tablet === 2 ? 'md:basis-1/2' : ''} ${sectionConfig?.carousel.itemsPerView.desktop === 3 ? 'lg:basis-1/3' : sectionConfig?.carousel.itemsPerView.desktop === 4 ? 'lg:basis-1/4' : 'lg:basis-1/2'}`}>
                  <VideoCard video={video} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-[-10px] translate-x-0 z-10 sm:-left-12 sm:translate-x-0" />
            <CarouselNext className="right-[-10px] translate-x-0 z-10 sm:-right-12 sm:translate-x-0" />
          </Carousel>
        )}
      </div>
    </Section>
  );
}

/**
 * Custom video card component that handles the VideoResourceWithNote type
 * Transforms Video resource data into a format compatible with ContentCard
 */
function VideoCard({ video }: { video: VideoResourceWithNote }) {
  
  // Transform VideoResourceWithNote into ContentCard-compatible format
  const contentItem = {
    id: video.id,
    type: 'video' as const,
    title: video.note?.tags.find(tag => tag[0] === "title")?.[1] ||
           video.note?.tags.find(tag => tag[0] === "name")?.[1] ||
           `Video ${video.id}`,
    description: video.note?.tags.find(tag => tag[0] === "summary")?.[1] ||
                video.note?.tags.find(tag => tag[0] === "description")?.[1] ||
                video.note?.tags.find(tag => tag[0] === "about")?.[1] || '',
    category: video.price > 0 ? 'Premium' : 'Free',
    duration: '15-30 min',
    image: video.note?.tags.find(tag => tag[0] === "image")?.[1] || '',
    href: `/content/${video.id}`,
    tags: video.note?.tags || [],
    author: video.userId,
    instructor: video.userId,
    instructorPubkey: video.note?.pubkey || '',
    published: true,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    price: video.price,
    isPremium: video.price > 0,
    isNew: false,
    rating: 4.5,
    studentsCount: 0,
    featured: false,
    topics: video.note?.tags.filter(tag => tag[0] === "t").map(tag => tag[1]) || [],
    additionalLinks: tagsToAdditionalLinks(video.note?.tags, 'r'),
    noteId: video.note?.id || video.noteId,
    purchases: video.purchases,
  };

  return <ContentCard item={contentItem} variant="content" showContentTypeTags={false} />;
} 
