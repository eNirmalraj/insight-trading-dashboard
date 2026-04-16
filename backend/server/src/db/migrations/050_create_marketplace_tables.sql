
-- Marketplace Listings
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id),
    author_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(script_id)
);

-- User Purchases (for paid scripts)
CREATE TABLE IF NOT EXISTS user_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
    amount DECIMAL(10, 2) NOT NULL,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Social: Likes
CREATE TABLE IF NOT EXISTS script_likes (
    user_id UUID NOT NULL REFERENCES auth.users(id),
    script_id UUID NOT NULL REFERENCES scripts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (user_id, script_id)
);

-- Social: Comments
CREATE TABLE IF NOT EXISTS script_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    parent_id UUID REFERENCES script_comments(id), -- Threaded comments
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_public ON marketplace_listings(is_public);
CREATE INDEX IF NOT EXISTS idx_likes_script ON script_likes(script_id);
CREATE INDEX IF NOT EXISTS idx_comments_script ON script_comments(script_id, created_at);
