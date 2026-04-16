import { supabaseAdmin } from './supabaseAdmin';

export interface PublicScript {
    id: string;
    authorId: string;
    scriptId: string; // Added to link back to core script
    name: string;
    description: string;
    category: 'indicator' | 'strategy' | 'Indicator' | 'Strategy';
    tags: string[];
    sourceCode?: string; // Optional, fetched separately if needed or included in join

    // Metrics
    downloads: number;
    stars: number;
    forks: number;

    // Verification
    verified: boolean; // Reviewed by platform
    hasFee: boolean;
    price?: number;

    isPublic: boolean;
    createdAt: string;
}

export class ScriptMarketplace {
    /**
     * List all public marketplace scripts
     */
    async listPublicScripts(limit: number = 50, offset: number = 0): Promise<PublicScript[]> {
        const { data, error } = await supabaseAdmin
            .from('marketplace_listings')
            .select(
                `
                *,
                scripts:script_id (source_code, name),
                likes_count:script_likes(count)
            `
            )
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw new Error(`Failed to list scripts: ${error.message}`);

        return (data || []).map((item: any) => this.mapToPublicScript(item));
    }

    /**
     * Get a single script details
     */
    async getScript(listingId: string): Promise<PublicScript> {
        const { data, error } = await supabaseAdmin
            .from('marketplace_listings')
            .select(
                `
                *,
                scripts:script_id (source_code, name),
                likes_count:script_likes(count)
            `
            )
            .eq('id', listingId)
            .single();

        if (error) throw new Error(`Script not found: ${error.message}`);
        return this.mapToPublicScript(data);
    }

    /**
     * Publish a script to the marketplace
     */
    async publishScript(
        scriptId: string,
        authorId: string,
        title: string,
        description: string,
        category: 'indicator' | 'strategy',
        tags: string[] = [],
        price: number = 0,
        isPublic: boolean = true
    ): Promise<PublicScript> {
        const { data, error } = await supabaseAdmin
            .from('marketplace_listings')
            .insert({
                script_id: scriptId,
                author_id: authorId,
                title,
                description,
                category,
                tags,
                price,
                is_public: isPublic,
            })
            .select(
                `
                *,
                scripts:script_id (source_code, name),
                likes_count:script_likes(count)
            `
            )
            .single();

        if (error) throw new Error(`Failed to publish script: ${error.message}`);
        return this.mapToPublicScript(data);
    }

    /**
     * Purchase a script
     */
    async purchaseScript(scriptId: string, userId: string): Promise<void> {
        // Here scriptId refers to the MESSAGE's PublicScript.id which maps to marketplace_listings.id
        // The user interface calls it scriptId, but internally it's the listing ID.
        const script = await this.getScript(scriptId);

        if (script.hasFee && script.price && script.price > 0) {
            await this.processPayment(userId, script.price);
        }

        // Grant access
        await this.grantAccess(userId, scriptId);
    }

    /**
     * Like a script
     */
    async likeScript(userId: string, scriptId: string): Promise<void> {
        const { error } = await supabaseAdmin.from('script_likes').insert({
            user_id: userId,
            script_id: scriptId,
        });

        if (error && error.code !== '23505') {
            // Ignore duplicate key error
            throw new Error(`Failed to like script: ${error.message}`);
        }
    }

    /**
     * Unlike a script
     */
    async unlikeScript(userId: string, scriptId: string): Promise<void> {
        const { error } = await supabaseAdmin
            .from('script_likes')
            .delete()
            .eq('user_id', userId)
            .eq('script_id', scriptId);

        if (error) throw new Error(`Failed to unlike script: ${error.message}`);
    }

    /**
     * Get like count for a script
     */
    async getLikeCount(scriptId: string): Promise<number> {
        const { count, error } = await supabaseAdmin
            .from('script_likes')
            .select('*', { count: 'exact', head: true })
            .eq('script_id', scriptId);

        if (error) throw new Error(`Failed to get like count: ${error.message}`);
        return count || 0;
    }

    /**
     * Add a comment to a script
     */
    async addComment(
        userId: string,
        scriptId: string,
        content: string,
        parentId?: string
    ): Promise<void> {
        const { error } = await supabaseAdmin.from('script_comments').insert({
            user_id: userId,
            script_id: scriptId,
            content,
            parent_id: parentId || null,
        });

        if (error) throw new Error(`Failed to add comment: ${error.message}`);
    }

    /**
     * Get comments for a script
     */
    async getComments(scriptId: string): Promise<any[]> {
        const { data, error } = await supabaseAdmin
            .from('script_comments')
            .select('*')
            .eq('script_id', scriptId)
            .order('created_at', { ascending: true });

        if (error) throw new Error(`Failed to get comments: ${error.message}`);
        return data || [];
    }

    /**
     * Mock Payment Processing
     */
    private async processPayment(userId: string, amount: number): Promise<void> {
        console.log(`Processing payment of $${amount} for user ${userId}`);
        // In real app: integrate Stripe/LemonSqueezy here
    }

    /**
     * Grant access to the script (Record purchase)
     */
    private async grantAccess(userId: string, listingId: string): Promise<void> {
        const { error } = await supabaseAdmin.from('user_purchases').insert({
            user_id: userId,
            listing_id: listingId,
            amount: 0, // Record access grant, amount tracked in payment processor or passed in
        });

        if (error) throw new Error(`Failed to grant access: ${error.message}`);
    }

    /**
     * Helper to map DB result to PublicScript
     */
    private mapToPublicScript(item: any): PublicScript {
        return {
            id: item.id,
            authorId: item.author_id,
            scriptId: item.script_id,
            name: item.title, // Use listing title
            description: item.description,
            category: item.category as any,
            tags: item.tags || [],
            sourceCode: item.scripts?.source_code,
            downloads: item.downloads || 0,
            stars: item.likes_count?.[0]?.count || 0, // Using count aggregation
            forks: item.forks || 0,
            verified: item.verified || false,
            hasFee: (item.price || 0) > 0,
            price: item.price,
            isPublic: item.is_public,
            createdAt: item.created_at,
        };
    }
    /**
     * Fork a script (Create a copy linked to original)
     */
    async forkScript(originalScriptId: string, userId: string): Promise<string> {
        // 1. Get original script content
        const { data: original, error: fetchError } = await supabaseAdmin
            .from('scripts')
            .select('*')
            .eq('id', originalScriptId)
            .single();

        if (fetchError) throw new Error(`Failed to fetch original script: ${fetchError.message}`);

        // 2. Create new script copy
        const { data: newScript, error: createError } = await supabaseAdmin
            .from('scripts')
            .insert({
                user_id: userId,
                name: `${original.name} (Fork)`,
                source_code: original.source_code,
                version: 1,
            })
            .select('id')
            .single();

        if (createError) throw new Error(`Failed to create fork: ${createError.message}`);

        // 3. Record fork relationship
        const { error: relationError } = await supabaseAdmin.from('script_forks').insert({
            original_script_id: originalScriptId,
            forked_script_id: newScript.id,
            forked_by: userId,
        });

        if (relationError)
            console.error(`Failed to record fork relationship: ${relationError.message}`); // Non-critical

        // 4. Increment fork count on marketplace listing (if exists)
        // This is an optimization; real count can be aggregated from script_forks
        await supabaseAdmin.rpc('increment_fork_count', { script_id: originalScriptId });

        return newScript.id;
    }

    /**
     * Report an issue with a script
     */
    async reportScript(
        userId: string,
        scriptId: string,
        reason: string,
        details: string
    ): Promise<void> {
        const { error } = await supabaseAdmin.from('script_reports').insert({
            reporter_id: userId,
            script_id: scriptId,
            reason,
            details,
        });

        if (error) throw new Error(`Failed to report script: ${error.message}`);
    }

    /**
     * Suggest an improvement
     */
    async suggestImprovement(
        userId: string,
        scriptId: string,
        title: string,
        description: string
    ): Promise<void> {
        const { error } = await supabaseAdmin.from('script_suggestions').insert({
            user_id: userId,
            script_id: scriptId,
            title,
            description,
        });

        if (error) throw new Error(`Failed to submit suggestion: ${error.message}`);
    }
}

export const scriptMarketplace = new ScriptMarketplace();
