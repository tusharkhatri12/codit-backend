import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { calculateRisk, analyzeOrderIntelligence } from '../modules/risk/riskEngine.js';
import { applyDecision } from '../modules/risk/decisionEngine.js';
import { msgQueue } from '../queues/whatsappQueue.js';
import { sendWhatsAppMessage } from '../modules/whatsapp/whatsapp.service.js';
import { checkOrderLimit } from '../middlewares/features.js';
import { createPaymentLink } from '../services/paymentService.js';
import { cancelShopifyOrder } from '../services/shopifyService.js';

// @desc    Handle incoming Shopify Order Creation Webhook
// @route   POST /api/webhooks/shopify/order-created
export const handleShopifyOrderCreate = async (req, res, next) => {
    try {
        const payload = req.body;
        console.log('\n[Shopify Webhook] 📦 New Order Payload Received');
        console.log(`[Shopify Webhook] Gateway: ${payload.gateway} | Status: ${payload.financial_status}`);
        
        // Shopify sends the domain in X-Shopify-Shop-Domain header
        const shopDomain = req.headers['x-shopify-shop-domain'] || payload.shop_domain || payload.domain;

        if (!shopDomain) {
            console.error('[Shopify Webhook] ❌ Missing shop domain in payload/headers');
            return res.status(400).json({ success: false, error: 'Shop domain identifier is required' });
        }

        // 1. Find Shop (Case-Insensitive)
        const shop = await Shop.findOne({ domain: new RegExp(`^${shopDomain}$`, 'i') });
        if (!shop) {
            console.error(`[Shopify Webhook] ❌ Shop NOT found in database: ${shopDomain}`);
            return res.status(404).json({ success: false, error: 'Shop not registered' });
        }

        // 2. Validate plan limits
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
            financial_status 
        } = payload;

        const phone = customer?.phone || shipping_address?.phone || billing_address?.phone || null;
        const isCOD = (gateway?.toLowerCase() === 'cod' || financial_status?.toLowerCase() === 'pending');
        
        console.log(`[Shopify Webhook] 🕵️ COD Detection: ${isCOD ? '✅ YES' : '❌ NO'}`);

        // 3. Map payload to schema template
        const orderData = {
            shop: shop._id,
            shopifyOrderId: (id || '').toString(),
            orderNumber: (order_number || id || 'N/A').toString(),
            phone: phone,
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
            currency: currency || 'INR',
            isCod: isCOD,
            financialStatus: financial_status || 'pending'
        };

        // --- BRANCH LOGIC: PREPAID vs COD ---
        if (!isCOD) {
            orderData.status = 'verified';
            orderData.orderStatus = 'confirmed';
            orderData.riskScore = 0;
            orderData.riskLevel = 'SAFE';
            orderData.recommendation = 'Safe';
            orderData.whatsappDeliveryStatus = 'delivered';
            orderData.finalDecision = 'auto_confirm';
            orderData.decisionReason = 'Prepaid order: Verified via gateway';
        } else {
            // --- COD FLOW: Risk Engine & Decisions ---
            // Use the centralized intelligence engine for consistent scoring
            const intelligence = await analyzeOrderIntelligence(orderData);
            
            orderData.riskScore = intelligence.riskScore;
            orderData.riskLevel = intelligence.riskLevel;
            orderData.riskReasons = intelligence.riskReasons;
            orderData.recommendation = intelligence.recommendation;
            
            // Auto-Hold for high risk (> 70 as per final spec)
            if (orderData.riskScore > 70) {
                orderData.isHeld = true;
                orderData.orderStatus = 'held';
                orderData.status = 'flagged';
                orderData.decisionReason = 'Auto-held: High risk score (>70)';
                
                // Trigger Partial COD
                orderData.paymentRequired = true;
                orderData.paymentAmount = 100;
                orderData.paymentStatus = 'pending';
            } else if (orderData.riskLevel === 'CRITICAL' || orderData.riskLevel === 'HIGH') {
                orderData.status = 'flagged';
            } else if (orderData.riskLevel === 'SAFE') {
                orderData.status = 'verified';
                orderData.whatsappDeliveryStatus = 'delivered';
            }
        }

        const order = await Order.create(orderData);

        // 4. Generate Payment Link
        if (order.paymentRequired) {
            try {
                const shortUrl = await createPaymentLink(order, order.paymentAmount);
                order.paymentLink = shortUrl;
                await order.save();
                console.log(`[Shopify Webhook] ✅ Generated Payment Link: ${shortUrl}`);
            } catch (err) {
                console.error(`[Shopify Webhook] ❌ Failed to generate payment link:`, err.message);
            }
        }

        // 5. Enqueue WhatsApp
        if (order.isCod && order.riskLevel !== 'SAFE' && shop.whatsappConfig?.enabled !== false) {
            await msgQueue.add('send-whatsapp', {
                orderId: order._id,
                shopId: shop._id
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 }
            });
            console.log(`[Shopify Webhook] 📱 Enqueued WhatsApp job for Order ${order.orderNumber}`);
        }

        const io = req.app.get('io');
        if (io) io.emit('DASHBOARD_UPDATE', { shopId: shop._id });

        res.status(200).json({ success: true, message: 'Webhook processed', orderId: order._id });
    } catch (err) {
        if (err.code === 11000) return res.status(200).json({ success: true, message: 'Duplicate order ignored' });
        console.error('[Shopify Webhook] ❌ Fatal Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Handle incoming Twilio Sandbox Webhooks (Replies)
export const handleTwilioReply = async (req, res, next) => {
    try {
        const { From, Body } = req.body;
        console.log(`\n[Twilio Webhook] 🔔 Reply from ${From}: ${Body}`);

        if (!From || !Body) return res.status(200).send('Ignored - Missing fields');

        const normalizedPhone = From.replace('whatsapp:', '').trim();
        const normalizedMessage = Body.toUpperCase().trim();

        const matchedOrder = await Order.findOne({ 
            phone: normalizedPhone, 
            orderStatus: { $in: ['new', 'held'] } 
        }).sort({ createdAt: -1 });

        if (!matchedOrder) {
            console.warn(`[Twilio Webhook] ⚠️ No active order found for ${normalizedPhone}`);
            return res.status(200).send('Ignored');
        }

        if (normalizedMessage.includes('YES')) {
            const decision = applyDecision(matchedOrder, 'YES');
            matchedOrder.orderStatus = decision.orderStatus;
            matchedOrder.finalDecision = decision.finalDecision;
            matchedOrder.decisionReason = decision.decisionReason;
            matchedOrder.isHeld = decision.isHeld;
            matchedOrder.whatsappStatus = 'confirmed';
            matchedOrder.repliedAt = new Date();
            await sendWhatsAppMessage(normalizedPhone, "Your order is confirmed! Thank you.");
        } else if (normalizedMessage.includes('NO')) {
            const decision = applyDecision(matchedOrder, 'NO');
            matchedOrder.orderStatus = decision.orderStatus;
            matchedOrder.finalDecision = decision.finalDecision;
            matchedOrder.whatsappStatus = 'rejected';
            matchedOrder.repliedAt = new Date();
            
            // --- NEW: Sync Cancellation to Shopify ---
            const shop = await Shop.findById(matchedOrder.shop);
            if (shop && shop.accessToken && !matchedOrder.shopifyOrderId?.startsWith('demo_')) {
                await cancelShopifyOrder(shop.domain, shop.accessToken, matchedOrder.shopifyOrderId, 'customer');
            }
            
            await sendWhatsAppMessage(normalizedPhone, "Your order has been cancelled.");
        }

        await matchedOrder.save();
        const io = req.app.get('io');
        if (io) io.emit('DASHBOARD_UPDATE', { shopId: matchedOrder.shop });

        res.status(200).send('Reply processed');
    } catch (err) {
        console.error('[Twilio Webhook] ❌ Error:', err.message);
        res.status(200).send('Error caught');
    }
};

// @desc    Handle incoming Razorpay Payment Webhooks
export const handleRazorpayWebhook = async (req, res, next) => {
    try {
        console.log('\n[Razorpay Webhook] 💰 Incoming Payment Update');
        const payload = req.method === 'POST' ? req.body : req.query;
        
        // Extract from payment_link.paid event or redirect params
        let paymentLinkUrl = payload.payload?.payment_link?.entity?.short_url || payload.payment_link_url;
        let referenceId = payload.payload?.payment_link?.entity?.reference_id || payload.razorpay_payment_link_reference_id;

        // 1. Find Order by reference_id or short_url
        let order;
        if (referenceId) {
            order = await Order.findById(referenceId);
        } else if (paymentLinkUrl) {
            order = await Order.findOne({ paymentLink: paymentLinkUrl });
        }

        if (!order) {
            console.warn('[Razorpay Webhook] ⚠️ Order not found for payload');
            return res.status(200).json({ success: false });
        }

        if (order.paymentStatus === 'paid') return res.status(200).json({ success: true });

        // 2. Update Order
        console.log(`[Razorpay Webhook] ✅ Payment success for Order ${order.orderNumber}`);
        order.paymentStatus = 'paid';
        order.status = 'verified';
        order.orderStatus = 'confirmed';
        order.finalDecision = 'auto_confirm';
        order.decisionReason = 'Partial COD Payment received via Razorpay';
        order.isHeld = false;
        
        await order.save();

        const io = req.app.get('io');
        if (io) io.emit('DASHBOARD_UPDATE', { shopId: order.shop });

        if (req.method === 'GET') {
            return res.send(`
                <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0c1324; color: white;">
                    <div style="text-align: center;">
                        <h1 style="color: #10b981;">Payment Successful! ✅</h1>
                        <p>Order #${order.orderNumber} confirmed.</p>
                    </div>
                </body>
            `);
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('[Razorpay Webhook] ❌ Error:', err.message);
        res.status(500).json({ success: false });
    }
};
