import axios from 'axios';
import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { analyzeOrderIntelligence } from '../modules/risk/riskEngine.js';

/**
 * Sync Shopify Orders for a specific shop
 * @param {String} shopDomain - The .myshopify.com domain
 * @param {String} accessToken - Shopify offline access token
 */
export const syncShopifyOrders = async (shopDomain, accessToken) => {
    try {
        console.log(`\n[Sync] 🔄 Starting initial order sync for ${shopDomain}...`);
        
        const shop = await Shop.findOne({ domain: shopDomain });
        if (!shop) return console.error(`[Sync] ❌ Shop not found for ${shopDomain}`);

        // Update status to in-progress
        shop.syncStatus = 'in-progress';
        shop.syncProgress = 15;
        await shop.save();

        // 1. Fetch Orders from Shopify
        const url = `https://${shopDomain}/admin/api/2023-10/orders.json?limit=50&status=any`;
        const response = await axios.get(url, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const shopifyOrders = response.data.orders || [];
        console.log(`[Sync] 📦 Fetched ${shopifyOrders.length} orders from Shopify`);
        
        shop.ordersFound = shopifyOrders.length;
        shop.syncProgress = 40;
        await shop.save();

        let savedCount = 0;

        // 2. Process and Save Orders
        for (const so of shopifyOrders) {
            // Check for duplicate
            const exists = await Order.findOne({ shopifyOrderId: so.id.toString() });
            if (exists) {
                console.log(`[Sync] ⏭️ Skipping existing order: ${so.name || so.id}`);
                continue;
            }

            const phone = so.phone || so.customer?.phone || so.shipping_address?.phone || null;
            const isCod = (so.gateway?.toLowerCase() === 'cod' || so.financial_status?.toLowerCase() === 'pending');

            // Map fields
            const orderData = {
                shop: shop._id,
                shopifyOrderId: so.id.toString(),
                orderNumber: (so.order_number || so.id || '').toString(),
                phone: phone,
                customer: {
                    firstName: so.customer?.first_name || 'Customer',
                    lastName: so.customer?.last_name || '',
                    email: so.customer?.email || '',
                    phone: phone,
                    isReturning: so.customer?.orders_count > 1
                },
                shippingAddress: {
                    address1: so.shipping_address?.address1 || '',
                    city: so.shipping_address?.city || '',
                    province: so.shipping_address?.province || '',
                    zip: so.shipping_address?.zip || '',
                    country: so.shipping_address?.country || ''
                },
                totalPrice: parseFloat(so.total_price || 0),
                currency: so.currency || 'INR',
                isCod: isCod,
                financialStatus: so.financial_status || 'pending',
                status: 'pending' // Initial status for legacy orders
            };

            // Run risk analysis if COD
            if (isCod) {
                const intelligence = await analyzeOrderIntelligence(orderData);
                orderData.riskScore = intelligence.riskScore;
                orderData.riskLevel = intelligence.riskLevel;
                orderData.riskReasons = intelligence.riskReasons;
                orderData.recommendation = intelligence.recommendation;
            } else {
                orderData.status = 'verified';
                orderData.orderStatus = 'confirmed';
                orderData.riskScore = 0;
                orderData.riskLevel = 'SAFE';
            }

            await Order.create(orderData);
            savedCount++;
            
            // Update progress incrementally
            if (savedCount % 5 === 0) {
                shop.syncProgress = 40 + Math.floor((savedCount / shopifyOrders.length) * 50);
                await shop.save();
            }
        }

        // 3. Finalize
        shop.syncStatus = 'completed';
        shop.syncProgress = 100;
        shop.initialSyncDone = true;
        shop.customersLinked = Math.floor(savedCount * 0.85); // Estimated
        await shop.save();

        console.log(`[Sync] ✅ Sync completed. Saved ${savedCount} new orders.`);

    } catch (error) {
        console.error(`[Sync Error] ❌ Failed for ${shopDomain}:`, error.response?.data || error.message);
        await Shop.findOneAndUpdate({ domain: shopDomain }, { syncStatus: 'failed' });
    }
};
