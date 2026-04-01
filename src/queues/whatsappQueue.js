import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { sendWhatsAppMessage } from '../modules/whatsapp/whatsapp.service.js';
import dotenv from 'dotenv';
dotenv.config();

// Redis Connection Setup
let connection;
if (process.env.REDIS_URL) {
    connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
} else {
    connection = new IORedis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        maxRetriesPerRequest: null
    });
}

// 1. Initialize Queue
export const msgQueue = new Queue('whatsapp-messages', { connection });

// 2. Initialize Worker
const msgWorker = new Worker('whatsapp-messages', async job => {
    const { orderId, shopId } = job.data;
    console.log(`\n[WhatsApp Worker] 🚀 Processing Job ${job.id} for Order: ${orderId}`);

    try {
        // --- SAFETY DELAY ---
        // Give the DB a moment to ensure the previous 'save' with paymentLink is fully finished
        await new Promise(resolve => setTimeout(resolve, 1500));

        let order = await Order.findById(orderId);
        const shop = await Shop.findById(shopId);

        if (!order || !shop) {
            console.error(`[WhatsApp Worker] ❌ Order or Shop not found. Order: ${orderId}, Shop: ${shopId}`);
            return;
        }

        // --- CONTEXTUAL MESSAGE GENERATION ---
        let messageText;
        const total = order.totalPrice ? order.totalPrice.toLocaleString() : 'X';
        const partial = order.paymentAmount || 100;

        // Ensure we have the most recent link
        if (order.paymentRequired && order.paymentStatus === 'pending') {
            const link = order.paymentLink;
            
            if (!link || link === 'Link Pending') {
                console.warn(`[WhatsApp Worker] ⚠️ Link still missing for #${order.orderNumber}. Attempting one last refresh...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                order = await Order.findById(orderId);
            }

            const finalLink = order.paymentLink || 'Link Pending (Contact Support)';
            messageText = `Hi 👋 To confirm your COD order of ₹${total}, please pay ₹${partial} advance: ${finalLink}\n\nThis amount will be adjusted in your final order.`;
        } else {
            messageText = `Hi! Please confirm your COD order of ₹${total}. Reply YES to confirm or NO to cancel.`;
        }

        console.log(`[WhatsApp Worker] 📝 Sending Message to ${order.phone}:`);
        console.log(`--------------------------------------------------`);
        console.log(messageText);
        console.log(`--------------------------------------------------`);

        const targetPhone = order.phone || order.customer?.phone;
        if (!targetPhone) {
            console.warn(`[WhatsApp Worker] ⚠️ No phone number found for Order ${order.orderNumber}. Job aborted.`);
            order.whatsappDeliveryStatus = 'failed';
            await order.save();
            return;
        }

        // 3. Dispatch Message
        const apiResponse = await sendWhatsAppMessage(targetPhone, messageText);

        if (apiResponse.success) {
            order.whatsappDeliveryStatus = 'sent';
            await order.save();
            console.log(`[WhatsApp Worker] ✅ Job ${job.id} SUCCESS. SID: ${apiResponse.sid}`);
        } else {
            order.whatsappDeliveryStatus = 'failed';
            await order.save();
            console.error(`[WhatsApp Worker] ❌ Job ${job.id} FAILED: ${apiResponse.error}`);
        }

    } catch (error) {
        console.error(`[WhatsApp Worker] ❌ System Error in Job ${job.id}:`, error.message);
        throw error;
    }
}, { connection });

msgWorker.on('failed', (job, err) => {
    console.log(`[BullMQ] ❌ Job ${job.id} definitively failed: ${err.message}`);
});

msgWorker.on('completed', (job) => {
    console.log(`[BullMQ] ✅ Job ${job.id} fully completed`);
});

export const initQueues = () => {
    console.log('✅ BullMQ WhatsApp Worker ready to process jobs');
};

/**
 * Helper to queue messages from any controller
 */
export const queueWhatsAppConfirmation = async (order) => {
    if (!order || !order._id) return;
    
    await msgQueue.add('send-whatsapp', {
        orderId: order._id,
        shopId: order.shop
    }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 }
    });
    
    console.log(`[Queue] 📮 Enqueued WhatsApp Job for Order #${order.orderNumber}`);
};
