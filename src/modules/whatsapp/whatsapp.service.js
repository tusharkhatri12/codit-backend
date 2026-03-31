import { twilioClient, twilioNumber } from '../../config/twilio.js';

/**
 * Service to execute out-bound WhatsApp messages via Twilio Sandbox.
 * Includes explicit fault tolerance so the main express/worker threads never crash.
 */
export const sendWhatsAppMessage = async (phone, message) => {
    console.log('\n[WhatsApp Service] 🔄 Triggered sendWhatsAppMessage');
    
    // Ensure numbers strictly use the Whatsapp scheme and handle potential missing ones
    if (!phone) {
        console.warn('    ⚠️ [WhatsApp Service] Phone number missing, cannot dispatch message.');
        return { success: false, error: 'Phone number missing' };
    }

    const formattedTarget = phone.includes('whatsapp:') ? phone : `whatsapp:${phone}`;
    console.dir({
        action: 'dispatching',
        from: twilioNumber,
        to: formattedTarget,
        body: message
    }, { depth: null });

    if (!twilioClient) {
        console.error('    ❌ [WhatsApp Service] Twilio Client not initialized due to missing ENV variables.');
        return { success: false, error: 'Missing Twilio Configuration' };
    }

    try {
        const response = await twilioClient.messages.create({
            from: twilioNumber,
            to: formattedTarget,
            body: message
        });

        console.log(`    ✅ [WhatsApp Service] Successfully Dispatched! Twilio SID: ${response.sid}`);
        return { success: true, sid: response.sid, response };
    } catch (error) {
        // Deep extensive logging for pure debug observability without bringing the instance down
        console.error('\n    ❌ [WhatsApp Service] Twilio Client Exception Thrown:');
        console.error('      - Code:', error.code);
        console.error('      - Status:', error.status);
        console.error('      - Message:', error.message);
        if (error.moreInfo) console.error('      - More Info:', error.moreInfo);
        
        return { success: false, error: error.message, code: error.code };
    }
};
