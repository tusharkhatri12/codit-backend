import Order from '../models/Order.js';

export const startExpirationJob = () => {
    // Run exactly every 5 minutes (300,000 ms)
    const INTERVAL_MS = 5 * 60 * 1000;
    
    console.log(`[Expiration Job] 🕒 Background Worker Initialized (Interval: ${INTERVAL_MS / 1000}s)`);

    setInterval(async () => {
        try {
            // Find timestamps implicitly older than exactly 2 hours ago natively
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

            // Execute isolated fast bulk updates via Mongoose without bridging unnecessary RAM allocations
            const result = await Order.updateMany(
                {
                    orderStatus: 'new',
                    whatsappStatus: 'sent',
                    messageSentAt: { $lte: twoHoursAgo }
                },
                {
                    $set: {
                        orderStatus: 'cancelled',
                        finalDecision: 'cancel',
                        decisionReason: 'No reply after timeout',
                        whatsappStatus: 'no_response'
                    }
                }
            );

            // Provide diagnostic feedback explicitly outlining the count natively
            if (result.modifiedCount > 0) {
                console.log(`\n[Expiration Job] 🧹 Auto-canceled ${result.modifiedCount} unresponsive orders (Ghosted for > 2 hours).`);
            }

        } catch (error) {
            console.error('[Expiration Job] ⚠️ Exception encountered scanning abandoned orders:', error.message);
        }
    }, INTERVAL_MS);
};
