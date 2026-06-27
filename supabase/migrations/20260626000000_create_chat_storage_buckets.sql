-- Create private storage buckets for chat image and file attachments.
-- Files are stored under chat/{user_id}/{uuid}-{filename} so RLS can
-- scope access to the owning user by matching the path segment.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('chat-images', 'chat-images', false),
  ('chat-files',  'chat-files',  false)
ON CONFLICT (id) DO NOTHING;

-- chat-images policies
CREATE POLICY "chat_images_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat_images_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat_images_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- chat-files policies
CREATE POLICY "chat_files_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat_files_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat_files_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
