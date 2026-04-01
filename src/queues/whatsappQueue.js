import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { sendWhatsAppMessage } from '../modules/whatsapp/whatsapp.service.js';
import dotenv from 'dotenv';
dotenv.config();

// Default to localhost if Redis env vars are missing. 
// For production, point REDIS_URL to Upstash or Redis Cloud
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

export const msgQueue = new Queue('whatsapp-messages', { connection });

// Initialize Worker
const msgWorker = new Worker('whatsapp-messages', async job => {
    const { orderId, shopId } = job.data;
    console.log(`[Worker] Processing Job ${job.id} for Order ID: ${orderId}`);

    try {
        const order = await Order.findById(orderId);
        const shop = await Shop.findById(shopId);

        if (!order || !shop) {
            throw new Error(`Order or Shop not found. O:${orderId} S:${shopId}`);
        }

        // Use the explicit exact message template outlined in the design spec
        let formattedTemplateString;
        const formattedTargetAmount = order.totalPrice ? order.totalPrice.toLocaleString() : 'X';

        if (order.paymentRequired && order.paymentStatus === 'pending') {
            const partialAmount = order.paymentAmount || 100;
            formattedTemplateString = `To confirm your COD order of ₹${formattedTargetAmount}, please pay ₹${partialAmount} advance: ${order.paymentLink || 'Link pending'}\n\nThis will be adjusted in your final amount.`;
        } else {
            formattedTemplateString = `Hi! Please confirm your COD order of ₹${formattedTargetAmount}. Reply YES to confirm or NO to cancel.`;
        }

        // Wait for genuine external API Response locally
        const apiResponse = await sendWhatsAppMessage(order.customer?.phone, formattedTemplateString);

        if (apiResponse.success) {
            // Update order status in DB
            order.whatsappDeliveryStatus = 'sent';
            await order.save();
            console.log(`[Worker] Job ${job.id} Successful. Message sent.`);
        } else {
            // If failed due to no phone number, we don't throw an error to trigger a retry.
            // We just log it and mark it failed permanently.
            order.whatsappDeliveryStatus = 'failed';
            await order.save();
            console.warn(`[Worker] Job ${job.id} Failed: ${apiResponse.reason}`);
        }

    } catch (error) {
        console.error(`[Worker] Job ${job.id} Errored: ${error.message}`);
        // Throwing error triggers BullMQ's automatic retry mechanism based on job options
        throw error;
    }

}, { connection });

msgWorker.on('failed', (job, err) => {
    console.log(`[BullMQ] Job ${job.id} has failed with ${err.message}`);
});

msgWorker.on('completed', (job) => {
    console.log(`[BullMQ] Job ${job.id} has completed successfully`);
});

export const initQueues = () => {
    console.log('✅ BullMQ WhatsApp Worker ready to process jobs');
};

export const queueWhatsAppConfirmation = async (order) => {
    if (!order || !order._id) return;
    
    await msgQueue.add('send-confirmation', {
        orderId: order._id,
        shopId: order.shop
    }, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000
        }
    });
    
    console.log(`[Queue] Added WhatsApp confirmation job for Order: ${order.orderNumber || order._id}`);
};
