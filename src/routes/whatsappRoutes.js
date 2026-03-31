import express from 'express';
import { sendWhatsAppMessage } from '../modules/whatsapp/whatsapp.service.js';
import { createOrder } from '../modules/orders/order.service.js';

const router = express.Router();

// @desc    Test WhatsApp Configuration manually via local ping
// @route   POST /api/webhooks/test/whatsapp
// @access  Public (Developer explicit validation only)
router.post('/whatsapp', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ success: false, error: 'Must provide phone and message fields in body payload.' });
        }

        const apiResponse = await sendWhatsAppMessage(phone, message);

        if (apiResponse.success) {
            res.status(200).json({ success: true, message: 'Message correctly dispatched to Twilio', sid: apiResponse.sid });
        } else {
            res.status(500).json({ success: false, error: apiResponse.error, code: apiResponse.code });
        }

    } catch (err) {
        console.error('Test Exception hit inside /test/whatsapp:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// @desc    Test Direct Order Synchronous Generation and Pipeline execution
// @route   POST /api/webhooks/test/order
// @access  Public
router.post('/order', async (req, res) => {
    try {
        const orderData = req.body;
        
        if (!orderData.phone || !orderData.totalPrice) {
            return res.status(400).json({ success: false, error: 'Must provide phone and totalPrice fields in payload.' });
        }

        const result = await createOrder(orderData);

        if (result.success) {
            res.status(201).json({ success: true, order: result.order });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
        
    } catch (err) {
        console.error('Test Exception hit inside /test/order:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
