import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { calculateRisk } from '../modules/risk/riskEngine.js';
import { applyDecision } from '../modules/risk/decisionEngine.js';
import { msgQueue } from '../queues/whatsappQueue.js';
import { sendWhatsAppMessage } from '../modules/whatsapp/whatsapp.service.js';
import { checkOrderLimit } from '../middlewares/features.js';
import { createPaymentLink } from '../services/paymentService.js';

// @desc    Handle incoming Shopify Order Creation Webhook
// @route   POST /api/webhooks/shopify/orders/create
// @access  Public (should verify HMAC in prod)
// @desc    Handle incoming Shopify Order Creation Webhook
// @route   POST /api/webhooks/shopify/order-created
// @access  Public (should verify HMAC in prod)
export const handleShopifyOrderCreate = async (req, res, next) => {
    try {
        const payload = req.body;
        console.log('\n[Shopify Webhook] 📦 New Order Payload Received');
        console.log(`[Shopify Webhook] Gateway: ${payload.gateway}`);
        console.log(`[Shopify Webhook] Financial Status: ${payload.financial_status}`);
        
        // Shopify sends the domain in X-Shopify-Shop-Domain header
        const shopDomain = req.headers['x-shopify-shop-domain'] || payload.shop_domain || payload.domain;

        if (!shopDomain) {
            console.error('[Webhook] Missing shop domain in payload/headers');
            return res.status(400).json({ success: false, error: 'Shop domain identifyer is required' });
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
            financial_status 
        } = payload;

        // Robust Phone Extraction
        const phone = customer?.phone || shipping_address?.phone || billing_address?.phone || null;

        // Determine if it's a COD order (using gateway and financial_status)
        // logic: gateway === "cod" OR financial_status === "pending"
        const isCOD = (gateway?.toLowerCase() === 'cod' || financial_status?.toLowerCase() === 'pending');
        console.log(`[Shopify Webhook] 🕵️ COD Detection: ${isCOD ? '✅ YES' : '❌ NO'} (Gateway: ${gateway}, Status: ${financial_status})`);

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
            isCod: isCOD,
            financialStatus: financial_status || 'pending'
        };

        // --- BRANCH LOGIC: PREPAID vs COD ---
        if (!isCOD) {
            // --- PREPAID FLOW: Confirm Instantly & Skip Checks ---
            orderData.status = 'verified';
            orderData.orderStatus = 'confirmed';
            orderData.riskScore = 0;
            orderData.riskLevel = 'SAFE';
            orderData.recommendation = 'Safe';
            orderData.whatsappDeliveryStatus = 'delivered'; // Skip WhatsApp
            orderData.finalDecision = 'auto_confirm';
            orderData.decisionReason = 'Prepaid order: Verified via gateway';
        } else {
            // --- COD FLOW: Risk Engine & Decisions ---
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
            if (orderData.riskScore > 50) {
                orderData.isHeld = true;
                orderData.finalDecision = 'hold';
                orderData.orderStatus = 'held';
                orderData.decisionReason = 'Auto-held: High risk score (>50)';
                orderData.status = 'flagged';
                
                // --- NEW: PARTIAL COD TRIGGER ---
                // For high risk COD, request ₹100 advance
                console.log(`[Webhook] 💰 Triggering Partial COD for high-risk Order ${orderData.orderNumber}`);
                orderData.paymentRequired = true;
                orderData.paymentAmount = 100;
                orderData.paymentStatus = 'pending';
                // Note: Actual link generation happens after initial creation or here?
                // Actually we need the _id for the ref_id, but the dummy can use orderNumber.
                // Let's create the link after we have the order document or use the shopifyOrderId.
            } else if (orderData.riskLevel === 'CRITICAL' || orderData.riskLevel === 'HIGH') {
                orderData.status = 'flagged';
            } else if (orderData.riskLevel === 'SAFE') {
                 orderData.status = 'verified';
                 orderData.whatsappDeliveryStatus = 'delivered'; // Skip WhatsApp for perfectly safe
            }
        }

        const order = await Order.create(orderData);

        // --- NEW: GENERATE PAYMENT LINK IF REQUIRED ---
        if (order.paymentRequired) {
            try {
                const shortUrl = await createPaymentLink(order, order.paymentAmount);
                order.paymentLink = shortUrl;
                await order.save();
                console.log(`[Webhook] ✅ Generated Payment Link for Order ${order.orderNumber}: ${shortUrl}`);
            } catch (err) {
                console.error(`[Webhook] ❌ Failed to generate payment link for Order ${order.orderNumber}:`, err.message);
            }
        }

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

/**
 * Handle incoming Razorpay Payment Webhooks (or Redirects)
 * @route GET/POST /api/webhooks/payment/razorpay
 */
export const handleRazorpayWebhook = async (req, res, next) => {
    try {
        console.log('\n[Razorpay Webhook] 💰 Incoming Payment Update Received!');
        
        // Supports both POST webhooks and GET redirects (for demo flexibility)
        const payload = req.method === 'POST' ? req.body : req.query;
        let shopifyOrderId = payload.shopify_order_id;
        let orderId = payload.razorpay_payment_link_reference_id; // Razorpay sends reference_id back

        // 1. Find Order
        let order;
        if (orderId) {
            order = await Order.findById(orderId);
        } else if (shopifyOrderId) {
            order = await Order.findOne({ shopifyOrderId });
        }

        if (!order) {
            console.warn('[Razorpay Webhook] ⚠️ Order not found for reference ID:', orderId);
            return res.status(200).json({ success: false, message: 'Order logic mapping failed' });
        }

        // 2. Prevent duplicate updates
        if (order.paymentStatus === 'paid') {
            console.log(`[Razorpay Webhook] 🔄 Order ${order.orderNumber} already marked as PAID.`);
            return res.status(200).json({ success: true, message: 'Duplicate update ignored' });
        }

        // 3. Update Order Status
        console.log(`[Razorpay Webhook] ✅ Payment success for Order ${order.orderNumber}. Confirming...`);
        order.paymentStatus = 'paid';
        order.status = 'verified';
        order.orderStatus = 'confirmed';
        order.finalDecision = 'auto_confirm';
        order.decisionReason = 'Partial COD Payment (₹100) received via Razorpay';
        order.isHeld = false; // Release from auto-hold
        
        await order.save();

        // 4. Notify connected dashboards
        const io = req.app.get('io');
        if (io) {
            io.emit('DASHBOARD_UPDATE', { shopId: order.shop });
        }

        // Redirect if it's a browser request (for testing)
        if (req.method === 'GET') {
            return res.send(`
                <html>
                    <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0c1324; color: white; text-align: center;">
                        <div>
                            <h1 style="color: #10b981;">Payment Successful! ✅</h1>
                            <p>Thank you. Your order #${order.orderNumber} has been confirmed.</p>
                            <p style="color: #94a3b8; font-size: 0.8rem;">You can close this window now.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        res.status(200).json({ success: true, message: 'Payment processed' });

    } catch (err) {
        console.error('[Razorpay Webhook] ❌ Error processing payment callback:', err.message);
        res.status(500).json({ success: false, error: 'Internal Error' });
    }
};
