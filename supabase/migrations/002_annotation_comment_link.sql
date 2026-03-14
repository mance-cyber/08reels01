-- Migration: Link annotations to comments
-- Annotations now belong to comments (not directly to versions).

-- Add comment_id column to annotations table
ALTER TABLE annotations
  ADD COLUMN comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;

-- Backfill: For existing annotations, attempt to link to a comment
-- at the same timecode in the same version. If no match, the annotation
-- will have a NULL comment_id and should be cleaned up manually.
UPDATE annotations a
SET comment_id = (
  SELECT c.id
  FROM comments c
  WHERE c.version_id = a.version_id
    AND FLOOR(c.timecode) = FLOOR(a.timecode)
  ORDER BY c.created_at ASC
  LIMIT 1
)
WHERE a.comment_id IS NULL;

-- After backfill, make comment_id NOT NULL
-- (Run this only after verifying all annotations have been linked)
-- ALTER TABLE annotations ALTER COLUMN comment_id SET NOT NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_annotations_comment_id ON annotations(comment_id);
