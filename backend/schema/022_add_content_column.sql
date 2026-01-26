-- 022_add_content_column.sql

-- Add a flexible 'content' column to store the full strategy/indicator JSON configuration
-- This ensures we don't lose data types that don't map 1:1 to existing columns (e.g. object parameters, outputs)
ALTER TABLE public.strategies 
    ADD COLUMN IF NOT EXISTS content JSONB;
