"use client";

import { useQueryClient } from '@tanstack/react-query';
import { useSnstrContext } from '@/contexts/snstr-context';
import { useSession } from '@/hooks/useSession';
import { coursesQueryKeys, getCourseViewerKey } from './useCoursesQuery';
import { lessonsQueryKeys } from './useLessonsQuery';
import { resourceNotesQueryKeys } from './useResourceNotes';
import { resourcesListQueryKeys } from './useResourcesListQuery';

/**
 * Hook for prefetching queries to improve navigation performance
 * Provides methods to prefetch courses, resources, and related data
 */
export function usePrefetch() {
  const queryClient = useQueryClient();
  const { relayPool, relays } = useSnstrContext();
  const { data: session, status } = useSession();
  const viewerKey = getCourseViewerKey(status, session?.user?.id);

  const prefetchResourcesList = (page: number, pageSize: number) => {
    import('./useResourcesListQuery').then(({ fetchResourcesList }) => {
      queryClient.prefetchQuery({
        queryKey: resourcesListQueryKeys.listPaginated(page, pageSize),
        queryFn: () => fetchResourcesList({ page, pageSize }),
        staleTime: 5 * 60 * 1000,
      });
    });
  };

  /**
   * Prefetch a course and its lessons on hover/focus
   * This provides near-instant navigation when user clicks
   */
  const prefetchCourse = (courseId: string) => {
    if (!courseId) return;

    // Import the fetch function dynamically to avoid circular dependencies
    import('./useCoursesQuery').then(({ fetchCourseWithLessons }) => {
      queryClient.prefetchQuery({
        queryKey: coursesQueryKeys.detailForViewer(courseId, viewerKey),
        queryFn: () => fetchCourseWithLessons(courseId, relayPool, relays),
        staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
      });
    });
  };

  /**
   * Prefetch a lesson and its resource details
   */
  const prefetchLesson = (courseId: string, lessonId: string) => {
    if (!courseId || !lessonId) return;

    import('./useCoursesQuery').then(({ fetchLessonWithDetails }) => {
      queryClient.prefetchQuery({
        queryKey: coursesQueryKeys.lesson(courseId, lessonId),
        queryFn: () => fetchLessonWithDetails(courseId, lessonId, relayPool, relays),
        staleTime: 5 * 60 * 1000,
      });
    });
  };

  /**
   * Prefetch resource notes for a list of resources
   * Useful when hovering over resource lists
   */
  const prefetchResourceNotes = (resourceIds: string[]) => {
    if (!resourceIds.length) return;

    import('./useResourceNotes').then(({ fetchResourceNotesBatch }) => {
      queryClient.prefetchQuery({
        queryKey: resourceNotesQueryKeys.batch(resourceIds.sort()),
        queryFn: () => fetchResourceNotesBatch(resourceIds, relayPool, relays),
        staleTime: 5 * 60 * 1000,
      });
    });
  };

  /**
   * Prefetch next page of paginated results
   * Call this when user is near the end of current page
   */
  const prefetchNextPage = (
    type: 'courses' | 'videos' | 'documents',
    currentPage: number,
    pageSize: number = 50
  ) => {
    const nextPage = currentPage + 1;

    switch (type) {
      case 'courses':
        import('./useCoursesQuery').then(({ fetchCoursesWithNotes }) => {
          queryClient.prefetchQuery({
            queryKey: coursesQueryKeys.listPaginated(nextPage, pageSize),
            queryFn: () => fetchCoursesWithNotes(relayPool, relays, { page: nextPage, pageSize }),
            staleTime: 5 * 60 * 1000,
          });
        });
        break;
      
      case 'videos':
      case 'documents':
        prefetchResourcesList(nextPage, pageSize);
        break;
    }
  };

  /**
   * Prefetch multiple items based on user's likely navigation patterns
   * Call this when user shows intent (hover, focus, scroll proximity)
   */
  const prefetchRelated = (
    primaryItem: {
      type: 'course' | 'lesson' | 'resource';
      id: string;
      courseId?: string;
    },
    relatedIds?: string[]
  ) => {
    switch (primaryItem.type) {
      case 'course':
        prefetchCourse(primaryItem.id);
        // Also prefetch the first few resources if we know them
        if (relatedIds) {
          prefetchResourceNotes(relatedIds.slice(0, 5)); // Prefetch first 5 resources
        }
        break;
        
      case 'lesson':
        if (primaryItem.courseId) {
          prefetchLesson(primaryItem.courseId, primaryItem.id);
          // Prefetch the parent course too
          prefetchCourse(primaryItem.courseId);
        }
        break;
        
      case 'resource':
        if (relatedIds) {
          prefetchResourceNotes([primaryItem.id, ...relatedIds.slice(0, 3)]);
        } else {
          prefetchResourceNotes([primaryItem.id]);
        }
        break;
    }
  };

  /**
   * Check if data is already cached to avoid unnecessary prefetching
   */
  const isCached = (
    type: 'course' | 'lesson' | 'videos' | 'documents' | 'resource-notes' | 'resource',
    ...args: (string | number | string[])[]
  ): boolean => {
    let queryKey: readonly unknown[];
    
    switch (type) {
      case 'course':
        queryKey = coursesQueryKeys.detailForViewer(args[0] as string, viewerKey);
        break;
      case 'lesson':
        queryKey = coursesQueryKeys.lesson(args[0] as string, args[1] as string);
        break;
      case 'videos':
      case 'documents':
        queryKey = args[1] !== undefined 
          ? resourcesListQueryKeys.listPaginated(args[0] as number, args[1] as number)
          : resourcesListQueryKeys.list();
        break;
      case 'resource-notes':
        queryKey = resourceNotesQueryKeys.batch(args[0] as string[]);
        break;
      case 'resource':
        // For individual resources, check if it's cached in resource-notes
        queryKey = resourceNotesQueryKeys.batch([args[0] as string]);
        break;
      default:
        return false;
    }
    
    return queryClient.getQueryData(queryKey) !== undefined;
  };

  return {
    prefetchCourse,
    prefetchLesson,
    prefetchResourceNotes,
    prefetchNextPage,
    prefetchRelated,
    isCached,
  };
}

/**
 * React component props to add prefetching to interactive elements
 * Usage: <div {...getPrefetchProps('course', courseId)} />
 */
export function usePrefetchProps() {
  const { prefetchRelated, isCached } = usePrefetch();

  const getPrefetchProps = (
    type: 'course' | 'lesson' | 'resource',
    id: string,
    courseId?: string,
    relatedIds?: string[]
  ) => ({
    onMouseEnter: () => {
      // Only prefetch if not already cached
      const cacheArgs = courseId ? [id, courseId] : [id];
      if (!isCached(type, ...cacheArgs)) {
        prefetchRelated({ type, id, courseId }, relatedIds);
      }
    },
    onFocus: () => {
      const cacheArgs = courseId ? [id, courseId] : [id];
      if (!isCached(type, ...cacheArgs)) {
        prefetchRelated({ type, id, courseId }, relatedIds);
      }
    },
  });

  return { getPrefetchProps };
}
