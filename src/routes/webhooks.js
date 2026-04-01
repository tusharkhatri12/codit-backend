import express from 'express';
import { handleShopifyOrderCreate, handleTwilioReply, handleRazorpayWebhook } from '../controllers/webhookController.js';

const router = express.Router();

router.post('/shopify/orders/create', handleShopifyOrderCreate); // Legacy
router.post('/shopify/order-created', handleShopifyOrderCreate); // Standardized
router.post('/whatsapp', handleTwilioReply);

// Razorpay Partial Payment Callbacks (supports GET for demo redirects)
router.all('/payment/razorpay', handleRazorpayWebhook);

export default router;
