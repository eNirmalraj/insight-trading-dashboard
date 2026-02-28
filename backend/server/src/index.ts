import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { startSignalListener } from './services/signalQueue';
import { startCryptoEngine, getCryptoEngineStatus } from './engine/cryptoEngine';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

import { supabaseAdmin } from './services/supabaseAdmin';

app.use(express.json());

// Health Check
app.get('/', (req, res) => {
    res.json({ status: 'Online', service: 'Insight Trading Engine' });
});

// Engine Status Endpoint
app.get('/engine/status', (req, res) => {
    res.json({
        crypto: getCryptoEngineStatus()
    });
});

// ========================================
// Marketplace API Routes
// ========================================
import { scriptMarketplace } from './services/marketplace';

// List public scripts
app.get('/api/marketplace/scripts', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const scripts = await scriptMarketplace.listPublicScripts(limit, offset);
        res.json(scripts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Publish a script
app.post('/api/marketplace/publish', async (req, res) => {
    try {
        const { scriptId, authorId, title, description, category, tags, price, isPublic } = req.body;
        const listing = await scriptMarketplace.publishScript(scriptId, authorId, title, description, category || 'strategy', tags, price, isPublic);
        res.json(listing);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Purchase a script
app.post('/api/marketplace/purchase/:listingId', async (req, res) => {
    try {
        const { listingId } = req.params;
        const { userId } = req.body;
        await scriptMarketplace.purchaseScript(listingId, userId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Like a script
app.post('/api/marketplace/like', async (req, res) => {
    try {
        const { userId, scriptId } = req.body;
        await scriptMarketplace.likeScript(userId, scriptId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get comments for a script
app.get('/api/marketplace/comments/:scriptId', async (req, res) => {
    try {
        const { scriptId } = req.params;
        const comments = await scriptMarketplace.getComments(scriptId);
        res.json(comments);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add a comment
app.post('/api/marketplace/comment', async (req, res) => {
    try {
        const { userId, scriptId, content, parentId } = req.body;
        await scriptMarketplace.addComment(userId, scriptId, content, parentId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// Leaderboard API Routes
// ========================================
import { leaderboardService } from './services/leaderboard';

// Top strategies by Sharpe Ratio
app.get('/api/community/leaderboard/sharpe', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const strategies = await leaderboardService.getTopStrategiesBySharpe(limit);
        res.json(strategies);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Most popular scripts
app.get('/api/community/leaderboard/popular', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const scripts = await leaderboardService.getMostPopularScripts(limit);
        res.json(scripts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Top contributors
app.get('/api/community/leaderboard/contributors', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const contributors = await leaderboardService.getTopContributors(limit);
        res.json(contributors);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server
app.listen(PORT, async () => {
    console.log(`🚀 Trading Engine running on port ${PORT}`);
    console.log(`🔗 Connected to Supabase...`);

    // Start Listening for Signals (existing functionality)
    await startSignalListener();

    // Start Crypto Signal Engine
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('       CRYPTO SIGNAL ENGINE STARTING       ');
    console.log('═══════════════════════════════════════════');
    console.log("[BOOT] Crypto Engine Started");
    await startCryptoEngine();
});
