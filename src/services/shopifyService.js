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
        const webhookUrl = `${process.env.BACKEND_URL}/api/webhooks/shopify/order-created`;
        
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
