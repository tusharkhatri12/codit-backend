import express from 'express';
import { handleShopifyOrderCreate, handleTwilioReply } from '../controllers/webhookController.js';

const router = express.Router();

router.post('/shopify/orders/create', handleShopifyOrderCreate); // Legacy
router.post('/shopify/order-created', handleShopifyOrderCreate); // Standardized
router.post('/whatsapp', handleTwilioReply);

export default router;
