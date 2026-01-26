-- Add settings column to profiles to store user preferences like UI layout, toolbar positions, etc.
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
