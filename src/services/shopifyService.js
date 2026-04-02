import axios from 'axios';

/**
 * Service to interact with the Shopify Admin API
 */

/**
 * Generate Shopify OAuth Authorization URL
 * @param {String} shop - The .myshopify.com domain
 * @param {String} state - Random security state (contains userId)
 * @returns {String}
 */
export const getOAuthUrl = (shop, state) => {
    const apiKey = process.env.SHOPIFY_API_KEY;
    const scopes = process.env.SHOPIFY_SCOPES;
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
    
    return `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
};

/**
 * Exchange Authorization Code for Access Token
 * @param {String} shop - The .myshopify.com domain
 * @param {String} code - Auth code from Shopify
 * @returns {Promise<String>} - The access token
 */
export const exchangeCodeForToken = async (shop, code) => {
    const url = `https://${shop}/admin/oauth/access_token`;
    const response = await axios.post(url, {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
    });
    return response.data.access_token;
};

/**
 * Register Order Creation Webhook
 * @param {String} shop - The .myshopify.com domain
 * @param {String} accessToken - Shopify access token
 * @returns {Promise<Boolean>}
 */
export const registerWebhook = async (shop, accessToken) => {
    try {
        const url = `https://${shop}/admin/api/2023-10/webhooks.json`;
        const baseUrl = (process.env.BACKEND_URL || 'https://codit-backend.onrender.com').replace(/\/$/, '');
        const webhookUrl = `${baseUrl}/api/webhooks/shopify/order-created`;
        
        const response = await axios.post(url, {
            webhook: {
                topic: 'orders/create',
                address: webhookUrl,
                format: 'json'
            }
        }, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`[Shopify Webhook] Registered 'orders/create' for ${shop}`);
        return true;
    } catch (error) {
        console.error(`[Shopify Webhook Error] Failed for ${shop}:`, error.response?.data || error.message);
        return false;
    }
};

/**
 * Start Initial Data Sync
 * @param {String} shopDomain - The .myshopify.com domain
 * @param {String} accessToken - Shopify access token
 * @param {Object} ShopModel - The Shop Mongoose model
 */
export const startInitialSync = async (shopDomain, accessToken, ShopModel) => {
    try {
        console.log(`[Sync] Starting initial sync for ${shopDomain}...`);
        
        // 1. Mark as in-progress
        await ShopModel.findOneAndUpdate({ domain: shopDomain }, { 
            syncStatus: 'in-progress',
            syncProgress: 10 
        });

        // 2. Fetch Order Count from Shopify
        const url = `https://${shopDomain}/admin/api/2023-10/orders/count.json?status=any`;
        const response = await axios.get(url, {
            headers: { 'X-Shopify-Access-Token': accessToken }
        });
        const orderCount = response.data.count || 0;
        
        // 3. Update with real order count and progress
        await ShopModel.findOneAndUpdate({ domain: shopDomain }, { 
            ordersFound: orderCount,
            customersLinked: Math.floor(orderCount * 0.8), // Mock customer count based on orders
            syncProgress: 40
        });

        // 4. Simulate the rest of the "sync" process (analysis, etc.)
        // In a real app, this would be a background queue job.
        setTimeout(async () => {
             await ShopModel.findOneAndUpdate({ domain: shopDomain }, { 
                syncProgress: 75
            });
            
            setTimeout(async () => {
                await ShopModel.findOneAndUpdate({ domain: shopDomain }, { 
                    syncProgress: 100,
                    syncStatus: 'completed'
                });
                console.log(`[Sync] Completed sync for ${shopDomain}`);
            }, 3000);
        }, 3000);

    } catch (error) {
        console.error(`[Sync Error] Failed for ${shopDomain}:`, error.message);
        await ShopModel.findOneAndUpdate({ domain: shopDomain }, { 
            syncStatus: 'failed'
        });
    }
};

/**
 * Cancel an order in Shopify
 * @param {String} shopDomain - The .myshopify.com domain
 * @param {String} accessToken - The offline access token
 * @param {String} shopifyOrderId - The Shopify internal order ID
 * @param {String} reason - 'customer', 'fraud', 'inventory', 'declined', 'other'
 * @returns {Promise<Object>} - The API response
 */
export const cancelShopifyOrder = async (shopDomain, accessToken, shopifyOrderId, reason = 'customer') => {
    try {
        console.log(`\n[Shopify Service] 🔄 Attempting to cancel Order ${shopifyOrderId} on ${shopDomain}`);

        if (!shopDomain || !accessToken || !shopifyOrderId) {
            console.error('    ❌ [Shopify Service] Missing required credentials/IDs for cancellation.');
            return { success: false, error: 'Missing parameters' };
        }

        // Shopify Admin API URL
        const url = `https://${shopDomain}/admin/api/2023-10/orders/${shopifyOrderId}/cancel.json`;

        const response = await axios.post(url, {
            reason: reason,
            restock: true
        }, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        console.log(`    ✅ [Shopify Service] Shopify order ${shopifyOrderId} cancelled successfully!`);
        return { success: true, data: response.data };

    } catch (error) {
        const errorMsg = error.response?.data?.errors || error.message;
        console.error('\n    ❌ [Shopify Service] Shopify Cancellation Failed:');
        console.error(`      - Status: ${error.response?.status}`);
        console.error(`      - Reason: ${JSON.stringify(errorMsg)}`);
        
        return { success: false, error: errorMsg };
    }
};
