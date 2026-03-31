import Order from '../../models/Order.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.service.js';
import { calculateRisk } from '../risk/riskEngine.js'; // The advanced AI intelligence module
import { checkOrderLimit } from '../../middlewares/features.js';

export const createOrder = async (orderData) => {
    try {
        console.log('\n[Order Service] 📥 Order received:', orderData);
        
        if (orderData.shop) {
            await checkOrderLimit(orderData.shop);
        }

        // --- 1. Customer Intelligence Sweep ---
        console.log(`[Risk Engine] 🔍 Sweeping historical context for: ${orderData.phone}...`);
        
        // Find all previous orders for this phone, excluding the one we are about to create 
        const previousOrders = await Order.find({ phone: orderData.phone });

        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        
        const customerHistory = {
            totalOrders: previousOrders.length,
            confirmedOrders: previousOrders.filter(o => o.orderStatus === 'confirmed').length,
            cancelledOrders: previousOrders.filter(o => o.orderStatus === 'cancelled').length,
            recentOrders: previousOrders.filter(o => (now - new Date(o.createdAt).getTime()) < oneDay).length
        };

        console.log(`[Risk Engine] 🧠 Context mapped:`, customerHistory);

        // --- 2. Build Base Order Object ---
        const newOrder = await Order.create({
            phone: orderData.phone,
            totalPrice: orderData.totalPrice,
            isNewCustomer: orderData.isNewCustomer,
            whatsappStatus: 'pending',
            orderStatus: 'new',
            // Default mappings mapped to dashboard payloads
            customer: { phone: orderData.phone, isReturning: !orderData.isNewCustomer },
            orderNumber: `TEST_ORD_${Date.now()}`
        });

        // --- 3. Run Advanced Risk Intelligence ---
        // We pass the fresh payload mixed with relational context history
        const riskAnalysis = calculateRisk(newOrder, customerHistory);
        console.log(`[Risk Engine] 💡 Final Verdict => Score: ${riskAnalysis.score} | Level: ${riskAnalysis.level}`);
        // Log all reasons distinctly
        riskAnalysis.reasons.forEach(r => console.log(`   - 📌 Reason: ${r}`));

        // 4. Update Mongoose Explicitly
        newOrder.riskScore = riskAnalysis.score;
        newOrder.riskLevel = riskAnalysis.level;
        newOrder.riskReasons = riskAnalysis.reasons;
        newOrder.recommendation = riskAnalysis.recommendation;
        await newOrder.save();

        // Step 6. Call sendWhatsAppMessage()
        console.log(`[Order Service] 📲 WhatsApp sending started...`);
        const formattedAmount = orderData.totalPrice ? orderData.totalPrice.toLocaleString() : 'X';
        const messageText = `Hi! Please confirm your COD order of ₹${formattedAmount}. Reply YES to confirm or NO to cancel.`;
        
        const waResponse = await sendWhatsAppMessage(orderData.phone, messageText);

        // Step 7/8. Success/Failure Toggle
        if (waResponse && waResponse.success) {
            console.log(`[Order Service] ✅ Success SID: ${waResponse.sid}`);
            newOrder.whatsappStatus = 'sent';
            newOrder.messageSentAt = new Date();
        } else {
            console.error(`[Order Service] ❌ WhatsApp error if failed: ${waResponse.error || 'Unknown Twilio SDK failure'}`);
            newOrder.whatsappStatus = 'failed';
        }

        // Step 9. Save final mapped order state
        await newOrder.save();
        
        return { success: true, order: newOrder };

    } catch (err) {
        // Step 6: Error Handling - Do not crash server, save failure state returning proper response execution chain
        console.error('[Order Service] ⚠️ Fatal Execution Exception:', err.message);
        return { success: false, error: err.message };
    }
};
