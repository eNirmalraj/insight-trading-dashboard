-- Add is_pinned column to signals table
ALTER TABLE signals ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- Optional: Update existing records to have false (already handled by default but good practice)
UPDATE signals SET is_pinned = FALSE WHERE is_pinned IS NULL;
