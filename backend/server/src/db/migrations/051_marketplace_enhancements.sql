-- Migration: Enhance Marketplace Listings
-- Description: Adds missing columns to support PublicScript interface requirements

ALTER TABLE public.marketplace_listings
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('indicator', 'strategy', 'Indicator', 'Strategy')),
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS downloads INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS forks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- Add index for category and tags
CREATE INDEX IF NOT EXISTS idx_marketplace_category ON public.marketplace_listings(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_tags ON public.marketplace_listings USING GIN(tags);
