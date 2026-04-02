import express from 'express';
import jwt from 'jsonwebtoken';
import { getOAuthUrl, exchangeCodeForToken, registerWebhook } from '../services/shopifyService.js';
import Shop from '../models/Shop.js';

const router = express.Router();

// @desc    Initiate Shopify OAuth
// @route   GET /auth/shopify
router.get('/shopify', async (req, res) => {
    try {
        const { shop, token } = req.query;

        if (!shop) {
            return res.status(400).send('Shop domain is required');
        }

        // Validate shop domain format
        const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
        if (!shopRegex.test(shop)) {
            return res.status(400).send('Invalid shop domain. Must be {shop}.myshopify.com');
        }

        // Identify user from token
        let userId = 'anonymous';
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (err) {
                console.error('[OAuth] Invalid token provided:', err.message);
                return res.status(401).send('Unauthorized: Invalid token');
            }
        }

        // Create state parameter (UserId + Nonce)
        const statePayload = {
            userId,
            nonce: Math.random().toString(36).substring(7),
            shop
        };
        const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');

        // Get Shopify Auth URL
        const authUrl = getOAuthUrl(shop, state);

        // Redirect user to Shopify
        res.redirect(authUrl);
    } catch (error) {
        console.error('[OAuth Init Error]:', error);
        res.status(500).send('Internal Server Error during OAuth initialization');
    }
});

// @desc    Shopify OAuth Callback
// @route   GET /auth/shopify/callback
router.get('/shopify/callback', async (req, res) => {
    try {
        const { shop, code, state, hmac } = req.query;

        if (!shop || !code || !state) {
            return res.status(400).send('Required parameters missing from Shopify callback');
        }

        // Decode state
        let statePayload;
        try {
            statePayload = JSON.parse(Buffer.from(state, 'base64').toString('ascii'));
        } catch (err) {
            return res.status(400).send('Invalid state parameter');
        }

        const { userId } = statePayload;

        // Exchange code for access token
        console.log(`[OAuth Callback] Exchanging code for ${shop}...`);
        const accessToken = await exchangeCodeForToken(shop, code);

        // Store in DB
        let shopRecord = await Shop.findOne({ domain: shop });
        if (shopRecord) {
            shopRecord.accessToken = accessToken;
            shopRecord.owner = userId !== 'anonymous' ? userId : shopRecord.owner;
            shopRecord.isActive = true;
            await shopRecord.save();
            console.log(`[OAuth Callback] Updated existing shop: ${shop}`);
        } else {
            shopRecord = await Shop.create({
                domain: shop,
                accessToken,
                owner: userId !== 'anonymous' ? userId : null // Should ideally always have a user
            });
            console.log(`[OAuth Callback] Created new shop record: ${shop}`);
        }

        // Register Webhooks automatically
        console.log(`[OAuth Callback] Registering webhooks for ${shop}...`);
        await registerWebhook(shop, accessToken);

        // Redirect back to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'https://www.coditai.in/';
        res.redirect(`${frontendUrl}dashboard?connected=true&shop=${shop}`);

    } catch (error) {
        console.error('[OAuth Callback Error]:', error.response?.data || error.message);
        res.status(500).send('Authentication failed during Shopify callback');
    }
});

export default router;
