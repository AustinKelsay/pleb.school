"use client";

import { createCourseDisplay, parseCourseEvent } from "@/data/types";
import { useCoursesQuery, CourseWithNote } from "@/hooks/useCoursesQuery";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ContentCard } from "@/components/ui/content-card";
import { ContentCardSkeleton } from "@/components/ui/content-skeleton";
import { Section } from "@/components/layout";
import { useHomepageSectionConfig } from "@/hooks/useContentConfig";
import { applyContentFilters } from "@/lib/content-config";
import { tagsToAdditionalLinks } from "@/lib/additional-links";
import { getEventATag } from "@/lib/nostr-a-tag";
import { resolvePreferredDisplayName } from "@/lib/profile-display";

/**
 * Client component for fetching and displaying courses
 * Uses the useCoursesQuery hook to fetch courses with their Nostr notes
 */
export function CoursesSection() {
  const { courses, isLoading, isError, error } = useCoursesQuery();
  const sectionConfig = useHomepageSectionConfig('courses');
  
  // If section is disabled in config, don't render
  if (!sectionConfig?.enabled) {
    return null;
  }
  
  // Apply filters from configuration
  const filteredCourses = sectionConfig ? applyContentFilters(courses, sectionConfig.filters) : courses;

  if (isLoading) {
    return (
      <Section spacing="lg" className="bg-muted/30">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">{sectionConfig?.title || 'Courses'}</h2>
            <p className="text-muted-foreground">
              {sectionConfig?.description || 'Structured learning paths from Bitcoin fundamentals to advanced Lightning Network development'}
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
      <Section spacing="lg" className="bg-muted/30">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">{sectionConfig?.title || 'Courses'}</h2>
            <p className="text-muted-foreground">
              {sectionConfig?.description || 'Structured learning paths from Bitcoin fundamentals to advanced Lightning Network development'}
            </p>
          </div>
          
          <div className="text-center py-12">
            <p className="text-red-600">Error loading courses: {error?.message}</p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section spacing="lg" className="bg-muted/30">
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Courses</h2>
          <p className="text-muted-foreground">
            Structured learning paths from Bitcoin fundamentals to advanced Lightning Network development
          </p>
        </div>
        
        {filteredCourses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No courses available at the moment.</p>
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
              {filteredCourses.map((course) => (
                <CarouselItem key={course.id} className={`pl-2 md:pl-4 basis-full ${sectionConfig?.carousel.itemsPerView.tablet === 2 ? 'md:basis-1/2' : ''} ${sectionConfig?.carousel.itemsPerView.desktop === 3 ? 'lg:basis-1/3' : sectionConfig?.carousel.itemsPerView.desktop === 4 ? 'lg:basis-1/4' : 'lg:basis-1/2'}`}>
                  <CourseCard course={course} />
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
 * Custom course card component that handles the CourseWithNote type
 * Transforms Course data into a format compatible with ContentCard
 */
function CourseCard({ course }: { course: CourseWithNote }) {
  const parsedCourse = course.note ? parseCourseEvent(course.note) : null
  const display = parsedCourse
    ? createCourseDisplay(course, parsedCourse)
    : null
  const instructorName = resolvePreferredDisplayName({
    preferredNames: [display?.instructor],
    user: course.user,
    pubkey: display?.instructorPubkey || course.note?.pubkey || course.user?.pubkey,
  })

  const contentItem = {
    id: course.id,
    type: 'course' as const,
    title: display?.title || `Course ${course.id}`,
    description: display?.description || '',
    category: course.price > 0 ? 'Premium' : 'Free',
    image: display?.image || '',
    href: `/courses/${course.id}`,
    tags: display?.tags || course.note?.tags || [],
    author: instructorName,
    instructor: instructorName,
    instructorPubkey: display?.instructorPubkey || course.note?.pubkey || course.user?.pubkey || '',
    published: true,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    price: course.price,
    isPremium: course.price > 0,
    isNew: false,
    rating: 4.5,
    studentsCount: 0,
    featured: false,
    topics: display?.topics || [],
    additionalLinks: display?.additionalLinks ?? tagsToAdditionalLinks(course.note?.tags, 'r'),
    noteId: course.note?.id || course.noteId,
    noteATag: getEventATag(course.note),
    purchases: course.purchases,
  };

  return <ContentCard item={contentItem} variant="content" showContentTypeTags={false} engagementMode="off" />;
} 
