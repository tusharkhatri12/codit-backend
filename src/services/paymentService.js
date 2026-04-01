import Razorpay from 'razorpay';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Partial COD Payment Service
 * Integrates with Razorpay for generating advance payment links.
 */

// Placeholder for dummy mode if keys are missing
const isDummyMode = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;

let razorpay;
if (!isDummyMode) {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
}

/**
 * Create a payment link for a high-risk COD order.
 * @param {Object} order - The order document
 * @param {Number} amount - The partial amount to collect (e.g., 100)
 * @returns {Promise<String>} - The payment URL
 */
export const createPaymentLink = async (order, amount) => {
    try {
        if (isDummyMode) {
            console.log(`[PaymentService] 🧪 DUMMY MODE: Generating mock Razorpay link for Order ${order.orderNumber}`);
            // Return a realistic looking dummy link (can be used for testing flow)
            return `https://rzp.io/i/mock_${order.shopifyOrderId || Date.now()}`;
        }

        const options = {
            amount: amount * 100, // Amount in paise (100 INR = 10000 paise)
            currency: "INR",
            accept_partial: false,
            reference_id: order._id.toString(),
            description: `Advance payment for COD Order #${order.orderNumber}`,
            customer: {
                name: order.customer?.firstName + ' ' + (order.customer?.lastName || ''),
                email: order.customer?.email || 'customer@example.com',
                contact: order.customer?.phone || '',
            },
            notify: {
                sms: true,
                email: true
            },
            reminder_enable: true,
            notes: {
                shopify_order_id: order.shopifyOrderId
            },
            callback_url: `${process.env.BACKEND_URL || 'https://codit-backend.onrender.com'}/api/webhooks/payment/razorpay`,
            callback_method: "get"
        };

        const paymentLink = await razorpay.paymentLink.create(options);
        return paymentLink.short_url;

    } catch (error) {
        console.error('[PaymentService] ❌ Razorpay Link Creation Failed:', error.message);
        // Fallback to dummy link in dev/test if error occurs (optional)
        return `https://rzp.io/i/fallback_${Date.now()}`;
    }
};
