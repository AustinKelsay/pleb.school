import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin-utils'
import CreateDraftForm from './components/create-draft-form'
import CreateCourseDraftForm from './components/create-course-draft-form'
import { MainLayout, Section } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileEdit, FileText, BookOpen } from 'lucide-react'

export default async function CreatePage({ 
  searchParams 
}: { 
  searchParams: Promise<{ draft?: string, type?: string }> 
}) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/auth/signin')
  }

  const adminStatus = await isAdmin(session)
  
  if (!adminStatus) {
    redirect('/')
  }

  const params = await searchParams
  const isEditing = !!params.draft
  const defaultTab = params.type === 'course' ? 'course' : 'resource'

  return (
    <MainLayout>
      <Section spacing="lg" className="border-b">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="w-fit">
                <FileEdit className="h-3 w-3 mr-1" />
                Draft Mode
              </Badge>
            </div>
            <h1 className="text-3xl font-bold">
              {isEditing ? 'Edit Draft' : 'Create New Content'}
            </h1>
            <p className="text-muted-foreground">
              {isEditing 
                ? 'Update your draft content before publishing to Nostr'
                : 'Create draft courses or resources that can be published as Nostr events later'
              }
            </p>
          </div>
        </div>
      </Section>
      
      <Section spacing="lg">
        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue={defaultTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="resource" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Resource
              </TabsTrigger>
              <TabsTrigger value="course" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Course
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="resource" className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Create Resource Draft</h2>
                <p className="text-sm text-muted-foreground">
                  Create standalone educational content like documents or videos
                </p>
              </div>
              <CreateDraftForm />
            </TabsContent>
            
            <TabsContent value="course" className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Create Course Draft</h2>
                <p className="text-sm text-muted-foreground">
                  Create structured learning paths with multiple lessons
                </p>
              </div>
              <CreateCourseDraftForm />
            </TabsContent>
          </Tabs>
        </div>
      </Section>
    </MainLayout>
  )
}
