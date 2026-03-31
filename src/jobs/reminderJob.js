import Order from '../models/Order.js';
import { sendWhatsAppMessage } from '../modules/whatsapp/whatsapp.service.js';

export const startReminderJob = () => {
    // Run exactly every 5 minutes (300,000 ms) matching the interval of the auto-eraser
    const INTERVAL_MS = 5 * 60 * 1000;
    
    console.log(`[Reminder Job] 🕒 Background Worker Initialized (Interval: ${INTERVAL_MS / 1000}s)`);

    setInterval(async () => {
        try {
            // Find timestamps implicitly older than exactly 30 minutes natively
            const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);

            // Using `.find()` instead of `updateMany` because we mandate sequential execution 
            // dispatching physical outbound HTTP SMS calls sequentially instead of blocking the DB thread
            const stalledOrders = await Order.find({
                orderStatus: 'new',
                whatsappStatus: 'sent',
                reminderSent: false,
                messageSentAt: { $lte: thirtyMinsAgo }
            });

            if (stalledOrders.length > 0) {
                console.log(`\n[Reminder Job] 🔔 Detected ${stalledOrders.length} unconfirmed orders exceeding 30-minutes. Initiating automatic follow-ups...`);
            }

            for (const order of stalledOrders) {
                const formattedAmount = order.totalPrice ? order.totalPrice.toLocaleString() : 'X';
                const messageText = `Reminder: Please confirm your COD order of ₹${formattedAmount}. Reply YES to confirm.`;

                console.log(`[Reminder Job] 📲 Dispatching Reminder SMS to Order: ${order._id}`);
                const waResponse = await sendWhatsAppMessage(order.phone, messageText);

                if (waResponse && waResponse.success) {
                    // Update MongoDB explicitly locking the order from receiving infinite loops of duplicate reminders safely.
                    order.reminderSent = true;
                    await order.save();
                    console.log(`    ✅ [Reminder Job] reminder triggered. Success SID: ${waResponse.sid}`);
                } else {
                    console.error(`    ❌ [Reminder Job] Failed to push Twilio reminder. Halting SMS re-attempts untill next cycle.`);
                }
            }

        } catch (error) {
            console.error('[Reminder Job] ⚠️ Exception encountered executing auto-reminders:', error.message);
        }
    }, INTERVAL_MS);
};
