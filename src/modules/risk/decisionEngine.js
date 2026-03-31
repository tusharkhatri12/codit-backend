/**
 * CODIT Decision Engine
 * Determines final order outcomes by combining risk intelligence and customer feedback.
 */

export const applyDecision = (order, replyType) => {
    const score = order.riskScore || 0;
    let finalDecision = 'manual_review';
    let orderStatus = 'pending_review';
    let decisionReason = 'Requires review';

    let isHeld = false;

    if (replyType === 'YES') {
        if (score < 40) {
            finalDecision = 'auto_confirm';
            orderStatus = 'confirmed';
            decisionReason = 'Low risk confirmed';
        } else if (score <= 70) {
            finalDecision = 'manual_review';
            orderStatus = 'pending_review';
            decisionReason = 'Medium risk requires review';
        } else {
            finalDecision = 'hold';
            orderStatus = 'held';
            decisionReason = 'High risk despite confirmation';
            isHeld = true;
        }
    } else if (replyType === 'NO') {
        finalDecision = 'cancel';
        orderStatus = 'cancelled';
        decisionReason = 'Customer cancelled via WhatsApp';
    } else if (replyType === 'TIMEOUT') {
        finalDecision = 'cancel';
        orderStatus = 'cancelled';
        decisionReason = 'No reply after timeout';
    }

    return { finalDecision, orderStatus, decisionReason, isHeld };
};
