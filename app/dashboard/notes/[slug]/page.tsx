import { redirect } from 'next/navigation'

import { APP_SCHEMA } from '@/lib/supabase/app-schema'
import { createClient } from '@/lib/supabase/server'
import { NotesEditorClient } from '../notes-editor-client'

type NotePageProps = {
  params: Promise<{
    slug: string
  }>
}

export default async function NotePage({ params }: NotePageProps) {
  const { slug } = await params
  const noteId = slug.trim()

  if (!noteId) {
    redirect('/dashboard/notes')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signin')
  }

  const { data: note, error } = await supabase
    .schema(APP_SCHEMA)
    .from('notes')
    .select('id, title, content')
    .eq('user_id', user.id)
    .eq('id', noteId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!note) {
    redirect('/dashboard/notes')
  }

  return (
    <NotesEditorClient
      noteId={note.id}
      initialTitle={note.title ?? 'Untitled'}
      initialContent={note.content ?? ''}
    />
  )
}
