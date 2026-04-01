import axios from 'axios';

/**
 * Service to interact with the Shopify Admin API
 */

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
