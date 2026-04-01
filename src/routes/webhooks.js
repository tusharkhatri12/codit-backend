import express from 'express';
import { handleShopifyOrderCreate, handleTwilioReply, handleRazorpayWebhook } from '../controllers/webhookController.js';

const router = express.Router();

// Diagnostic Logger for Webhooks
router.use('/shopify', (req, res, next) => {
    console.log(`\n[Webhook Debug] 📥 Incoming ${req.method} request to ${req.originalUrl}`);
    console.log(`[Webhook Debug] Domain: ${req.headers['x-shopify-shop-domain'] || 'NOT FOUND IN HEADERS'}`);
    next();
});

router.post('/shopify/orders/create', handleShopifyOrderCreate); // Legacy
router.post('/shopify/order-created', handleShopifyOrderCreate); // Standardized
router.post('/whatsapp', handleTwilioReply);

// Razorpay Partial Payment Callbacks (supports GET for demo redirects)
router.all('/payment/razorpay', handleRazorpayWebhook);

export default router;
