import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { calculateRisk } from '../modules/risk/riskEngine.js';
import { applyDecision } from '../modules/risk/decisionEngine.js';
import { msgQueue } from '../queues/whatsappQueue.js';
import { sendWhatsAppMessage } from '../modules/whatsapp/whatsapp.service.js';
import { checkOrderLimit } from '../middlewares/features.js';

// @desc    Handle incoming Shopify Order Creation Webhook
// @route   POST /api/webhooks/shopify/orders/create
// @access  Public (should verify HMAC in prod)
// @desc    Handle incoming Shopify Order Creation Webhook
// @route   POST /api/webhooks/shopify/order-created
// @access  Public (should verify HMAC in prod)
export const handleShopifyOrderCreate = async (req, res, next) => {
    try {
        const payload = req.body;
        // Shopify sends the domain in X-Shopify-Shop-Domain header
        const shopDomain = req.headers['x-shopify-shop-domain'] || payload.shop_domain || payload.domain;

        if (!shopDomain) {
            console.error('[Webhook] Missing shop domain in payload/headers');
            return res.status(400).json({ success: false, error: 'Shop domain identifyer is required' });
        }

        const shop = await Shop.findOne({ domain: shopDomain });
        if (!shop) {
            console.error(`[Webhook] Shop not found: ${shopDomain}`);
            return res.status(404).json({ success: false, error: 'Shop not registered' });
        }

        // Validate plan limits
        await checkOrderLimit(shop._id);

        const { 
            id, 
            order_number, 
            customer, 
            shipping_address, 
            billing_address, 
            total_price, 
            currency, 
            gateway,
            payment_gateway_names 
        } = payload;

        // Robust Phone Extraction
        const phone = customer?.phone || shipping_address?.phone || billing_address?.phone || null;

        // Map payload to our schema
        const orderData = {
            shop: shop._id,
            shopifyOrderId: (id || '').toString(),
            orderNumber: (order_number || id || 'N/A').toString(),
            phone: phone, // Root level phone for quick lookup
            customer: {
                firstName: customer?.first_name || 'Customer',
                lastName: customer?.last_name || '',
                email: customer?.email || '',
                phone: phone,
                isReturning: customer?.orders_count > 1
            },
            shippingAddress: {
                address1: shipping_address?.address1 || '',
                city: shipping_address?.city || '',
                province: shipping_address?.province || '',
                zip: shipping_address?.zip || '',
                country: shipping_address?.country || ''
            },
            billingAddress: {
                address1: billing_address?.address1 || '',
                city: billing_address?.city || '',
                province: billing_address?.province || '',
                zip: billing_address?.zip || '',
                country: billing_address?.country || ''
            },
            totalPrice: parseFloat(total_price || 0),
            currency: currency || 'USD',
            isCod: (payment_gateway_names?.some(g => g.toLowerCase().includes('cash') || g.toLowerCase().includes('cod')) || 
                   gateway?.toLowerCase().includes('cash') || 
                   gateway?.toLowerCase().includes('cod'))
        };

        // --- RUN CONTEXTUAL RISK ENGINE ---
        const phoneToSweep = orderData.customer?.phone || orderData.shippingAddress?.phone || null;
        let customerHistory = { totalOrders: 0, confirmedOrders: 0, cancelledOrders: 0, recentOrders: 0 };
        
        if (phoneToSweep) {
            const previousOrders = await Order.find({ phone: phoneToSweep });
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            customerHistory = {
                totalOrders: previousOrders.length,
                confirmedOrders: previousOrders.filter(o => o.orderStatus === 'confirmed').length,
                cancelledOrders: previousOrders.filter(o => o.orderStatus === 'cancelled').length,
                recentOrders: previousOrders.filter(o => (now - new Date(o.createdAt).getTime()) < oneDay).length
            };
        }

        const riskResult = calculateRisk(orderData, customerHistory);
        orderData.riskScore = riskResult.score;
        orderData.riskLevel = riskResult.level;
        orderData.riskReasons = riskResult.reasons;
        orderData.recommendation = riskResult.recommendation;
        
        // Initial status evaluation & Auto-Hold for high risk
        if (orderData.riskScore > 70) {
            orderData.isHeld = true;
            orderData.finalDecision = 'hold';
            orderData.orderStatus = 'held';
            orderData.decisionReason = 'Auto-held: High risk score (>70)';
            orderData.status = 'flagged';
        } else if (orderData.riskLevel === 'CRITICAL' || orderData.riskLevel === 'HIGH') {
            orderData.status = 'flagged';
        } else if (orderData.riskLevel === 'SAFE') {
             orderData.status = 'verified';
             orderData.whatsappDeliveryStatus = 'delivered'; // Skip WhatsApp for perfectly safe
        }

        const order = await Order.create(orderData);

        // ENQUEUE WHATSAPP JOB (If COD and medium/high risk, and not SAFE)
        if (order.isCod && orderData.riskLevel !== 'SAFE' && shop.whatsappConfig.enabled !== false) {
            await msgQueue.add('send-whatsapp', {
                orderId: order._id,
                shopId: shop._id
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 }
            });
            console.log(`[Webhook] Enqueued WhatsApp job for Order ${order.orderNumber}`);
        }

        // Notify connected dashboards
        const io = req.app.get('io');
        if (io) {
            io.emit('DASHBOARD_UPDATE', { shopId: shop._id });
        }

        res.status(200).json({ success: true, message: 'Webhook processed', orderId: order._id });
    } catch (err) {
        // If it's a duplicate order creation webhook
        if (err.code === 11000) {
            return res.status(200).json({ success: true, message: 'Duplicate order ignored' });
        }
        console.error('Webhook Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Handle incoming Twilio Sandbox Webhooks (Replies)
// @route   POST /api/webhooks/whatsapp
// @access  Public (Twilio Sandbox Forwarding)
export const handleTwilioReply = async (req, res, next) => {
    try {
        console.log('\n[Twilio Webhook] 🔔 Incoming WhatsApp Reply Received!');
        const { From, Body } = req.body;
        
        console.log(`[Twilio Webhook] Payload - From: ${From} | Body: ${Body}`);

        if (!From || !Body) {
            console.warn('[Twilio Webhook] ⚠️ Missing From or Body in Twilio payload, ignoring.');
            return res.status(200).send('Ignored - Missing fields');
        }

        // 2. Normalize Incoming Data
        // Twilio format: 'whatsapp:+919876543210' -> '+919876543210'
        const normalizedPhone = From.replace('whatsapp:', '').trim();
        const normalizedMessage = Body.toUpperCase().trim();

        // 3. Find Matching Order
        // Find latest order where phone matches AND orderStatus = "new" (sorted by createdAt descending)
        const matchedOrder = await Order.findOne({ 
            phone: normalizedPhone, 
            orderStatus: 'new' 
        }).sort({ createdAt: -1 });

        if (!matchedOrder) {
            console.warn(`[Twilio Webhook] ⚠️ No matching pristine '#new' order found for device ${normalizedPhone}. Ignoring.`);
            return res.status(200).send('Ignored - No matching tracking instance found');
        }

        console.log(`[Twilio Webhook] 🎯 Found matching Order ID: ${matchedOrder._id}`);

        // 4. Update Order Based on Reply & Decision Engine
        if (normalizedMessage.includes('YES')) {
            const decision = applyDecision(matchedOrder, 'YES');
            matchedOrder.orderStatus = decision.orderStatus;
            matchedOrder.finalDecision = decision.finalDecision;
            matchedOrder.decisionReason = decision.decisionReason;
            matchedOrder.isHeld = decision.isHeld;
            matchedOrder.whatsappStatus = 'confirmed';
            matchedOrder.repliedAt = new Date();
            
            await sendWhatsAppMessage(normalizedPhone, "Your order is confirmed! Thank you.");
            console.log(`[Twilio Webhook] ✅ Customer confirmed. Decision: ${decision.finalDecision} (${decision.decisionReason})`);
            
        } else if (normalizedMessage.includes('NO')) {
            const decision = applyDecision(matchedOrder, 'NO');
            matchedOrder.orderStatus = decision.orderStatus;
            matchedOrder.finalDecision = decision.finalDecision;
            matchedOrder.decisionReason = decision.decisionReason;
            matchedOrder.whatsappStatus = 'rejected';
            matchedOrder.repliedAt = new Date();
            
            await sendWhatsAppMessage(normalizedPhone, "Your order has been cancelled.");
            console.log(`[Twilio Webhook] 🚫 Customer cancelled. Decision: ${decision.finalDecision}`);
            
        } else {
            console.log(`[Twilio Webhook] 🤷 Customer provided unknown text. Ignoring mutation.`);
        }

        await matchedOrder.save();

        // 6. Notify connected React dashboards of live status drops explicitly
        const io = req.app.get('io');
        if (io) {
            // Because our payload schema might be isolated testing (without a shop_id), fallbacks to global update
            io.emit('DASHBOARD_UPDATE', { shopId: matchedOrder.shop || 'GLOBAL' });
        }

        res.status(200).send('Reply processed successfully');

    } catch (err) {
        // 7. Error Handling - Do not crash server
        console.error('\n[Twilio Webhook] ❌ Fatal API Webhook Parsing Exception:', err.message);
        res.status(200).send('Non-fatal Server Exception Caught');
    }
};
