
-- Create scripts table for language
CREATE TABLE IF NOT EXISTS scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name VARCHAR(255) NOT NULL,
    source_code TEXT NOT NULL,
    compiled_ir JSONB, -- Stores cached Intermediate Representation
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Optimize for user retrieval sorted by date
CREATE INDEX IF NOT EXISTS idx_scripts_user_created ON scripts(user_id, created_at DESC);

-- Optimize for name search
CREATE INDEX IF NOT EXISTS idx_scripts_name ON scripts(name);
