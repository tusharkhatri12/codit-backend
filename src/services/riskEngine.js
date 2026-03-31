/**
 * Risk Engine Utility
 * Evaluates orders based on predefined heuristics and returns a risk score (0-100)
 * and a risk level classification (LOW, MEDIUM, HIGH, CRITICAL).
 */

export const calculateRisk = (orderData) => {
    let score = 0;
    const factors = [];

    // 1. Customer history
    if (!orderData.isReturning) {
        score += 20;
        factors.push("New Customer");
    } else {
        score -= 10;
        factors.push("Returning Customer - Reduced Risk");
    }

    // 2. High Value Order
    const highValueThreshold = 200; // e.g. $200
    if (orderData.totalPrice > highValueThreshold) {
        score += 30;
        factors.push(`High Order Value (>$${highValueThreshold})`);
    }

    // 3. Address Mismatch
    const isBillingSameAsShipping = 
        orderData.shippingAddress && 
        orderData.billingAddress &&
        orderData.shippingAddress.zip === orderData.billingAddress.zip &&
        orderData.shippingAddress.address1 === orderData.billingAddress.address1;
        
    if (!isBillingSameAsShipping) {
        score += 40;
        factors.push("Billing and Shipping Address mismatch");
    }

    // 4. Guest Checkout (No account)
    if (!orderData.email && !orderData.phone) {
        score += 30;
        factors.push("Missing core contact info");
    }

    // Normalize score 0-100
    score = Math.max(0, Math.min(100, score));

    let level = 'LOW';
    if (score >= 80) level = 'CRITICAL';
    else if (score >= 60) level = 'HIGH';
    else if (score >= 30) level = 'MEDIUM';

    // If completely safe
    if (score <= 10) level = 'SAFE';

    return {
        score,
        level,
        factors
    };
};
