-- Add note favorites and icon support
ALTER TABLE tech_stack_2026.notes
  ADD COLUMN IF NOT EXISTS is_favorite boolean,
  ADD COLUMN IF NOT EXISTS icon_name text;

UPDATE tech_stack_2026.notes
SET is_favorite = false
WHERE is_favorite IS NULL;

UPDATE tech_stack_2026.notes
SET icon_name = 'utensils-crossed'
WHERE icon_name IS NULL;

ALTER TABLE tech_stack_2026.notes
  ALTER COLUMN is_favorite SET DEFAULT false,
  ALTER COLUMN is_favorite SET NOT NULL,
  ALTER COLUMN icon_name SET DEFAULT 'utensils-crossed',
  ALTER COLUMN icon_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_user_favorites_updated
  ON tech_stack_2026.notes (user_id, updated_at DESC)
  WHERE is_favorite = true;
