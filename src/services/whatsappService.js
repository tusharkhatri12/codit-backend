/**
 * WhatsApp Mock Service
 * Simulates sending confirmation messages to customers using an external API.
 */

export const sendWhatsAppConfirmation = async (order, shop) => {
    return new Promise((resolve) => {
        // Simulate API delay
        setTimeout(() => {
            const customerPhone = order.customer?.phone;
            
            if (!customerPhone) {
                console.log(`[WhatsApp API] Order ${order.orderNumber}: No phone number provided. Skipping.`);
                resolve({ success: false, reason: 'No phone number' });
                return;
            }

            console.log(`[WhatsApp API] Sending message to ${customerPhone}: "Hi ${order.customer?.firstName || 'Customer'}, please confirm your COD order #${order.orderNumber} from ${shop.domain}. Reply YES to confirm or NO to cancel."`);
            
            // In a real scenario, this would use Axios to call Twilio/Gupshup/WATI APIs
            resolve({ 
                success: true, 
                messageId: `wa_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                status: 'sent' 
            });
        }, 1500); // 1.5s simulated network delay
    });
};
