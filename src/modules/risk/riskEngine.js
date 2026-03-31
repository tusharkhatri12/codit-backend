/**
 * Advanced Contextual Risk Engine v2
 * Pure rule-based weighted scoring. No ML, no external APIs.
 * Designed to feel AI-powered while running on fast deterministic logic.
 */

import Order from '../../models/Order.js';

/**
 * Core weighted risk scorer.
 * Takes an order document and pre-fetched customer history array.
 * Returns { score, level, reasons, recommendation }.
 */
export const calculateRisk = (order, history = []) => {
    let score = 0;
    const reasons = [];

    const cancelled = history.filter(o => o.orderStatus === 'cancelled').length;
    const totalHistory = history.length;

    // --- Weight 1: New Customer (+25) ---
    const isNew = order.isNewCustomer || totalHistory <= 1;
    if (isNew) {
        score += 25;
        reasons.push('New customer — no prior order history');
    }

    // --- Weight 2: High Order Value (+20 / +30) ---
    if (order.totalPrice > 5000) {
        score += 30;
        reasons.push(`Critical order value (₹${order.totalPrice.toLocaleString()})`);
    } else if (order.totalPrice > 2000) {
        score += 20;
        reasons.push(`High order value (₹${order.totalPrice.toLocaleString()})`);
    }

    // --- Weight 3: Previous Cancellations (+30) ---
    if (cancelled > 0) {
        const cancelRate = totalHistory > 0 ? Math.round((cancelled / totalHistory) * 100) : 0;
        score += Math.min(30 + (cancelled * 5), 40); // scales with volume, cap at 40
        reasons.push(`${cancelled} previous cancellation(s) (${cancelRate}% cancel rate)`);
    }

    // --- Weight 4: Multiple Orders in Short Time (+20) ---
    if (history.length >= 2) {
        const sorted = [...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const latest = new Date(sorted[0].createdAt);
        const secondLatest = new Date(sorted[1].createdAt);
        const diffMinutes = (latest - secondLatest) / 60000;
        if (diffMinutes < 60) {
            score += 20;
            reasons.push(`Multiple orders within ${Math.round(diffMinutes)} minutes`);
        }
    }

    // --- Weight 5: Billing/Shipping Mismatch (+15) ---
    const hasShipping = order.shippingAddress?.city;
    const hasBilling = order.billingAddress?.city;
    if (hasShipping && hasBilling) {
        if (order.shippingAddress.city.toLowerCase() !== order.billingAddress.city.toLowerCase()) {
            score += 15;
            reasons.push('Shipping city ≠ billing city');
        }
    }
    if (order.shippingAddress?.zip && order.billingAddress?.zip) {
        if (order.shippingAddress.zip !== order.billingAddress.zip) {
            score += 10;
            reasons.push('Shipping ZIP ≠ billing ZIP');
        }
    }

    // --- Normalize & classify ---
    score = Math.min(score, 100);

    let level = 'LOW';
    let recommendation = 'Safe';
    if (score > 70) {
        level = 'CRITICAL';
        recommendation = 'Cancel';
    } else if (score > 40) {
        level = 'MEDIUM';
        recommendation = 'Review';
    } else if (score > 25) {
        level = 'HIGH'; // not critical but needs attention  
        // Actually let's keep this consistent: 25-40 is still safe/low-medium
        // Remap: >70 CRITICAL, 40-70 HIGH, 25-40 MEDIUM, <25 LOW
    }

    // Clean remap for consistency
    if (score > 70) { level = 'CRITICAL'; recommendation = 'Cancel'; }
    else if (score > 40) { level = 'HIGH'; recommendation = 'Review'; }
    else if (score > 20) { level = 'MEDIUM'; recommendation = 'Safe'; }
    else { level = 'LOW'; recommendation = 'Safe'; }

    return { score, level, reasons, recommendation };
};


/**
 * Full order intelligence analysis.
 * Fetches customer history, runs risk engine, computes fraud signals.
 * Single function for both webhook ingestion and detail API queries.
 */
export const analyzeOrderIntelligence = async (order) => {
    const targetPhone = order.phone || order.customer?.phone;

    // --- Fetch customer history ---
    let history = [];
    if (targetPhone) {
        history = await Order.find({ phone: targetPhone }).sort({ createdAt: -1 }).lean();
    }

    const confirmed = history.filter(o => o.orderStatus === 'confirmed').length;
    const cancelled = history.filter(o => o.orderStatus === 'cancelled').length;

    const customerStats = {
        totalOrders: history.length,
        confirmedOrders: confirmed,
        cancelledOrders: cancelled
    };

    // --- Run risk engine ---
    const risk = calculateRisk(order, history);

    // --- Generate fraud signals (human-readable insights layer) ---
    const fraudSignals = [];

    if (customerStats.totalOrders <= 1) {
        fraudSignals.push('First-time customer with no order history');
    }

    if (customerStats.totalOrders > 1 && (cancelled / customerStats.totalOrders) > 0.5) {
        fraudSignals.push(`Serial cancellation pattern detected (${Math.round((cancelled / customerStats.totalOrders) * 100)}% cancel rate)`);
    }

    if (cancelled >= 2 && order.orderStatus === 'new') {
        fraudSignals.push('Known repeat canceller placing a new order');
    }

    if (history.length >= 2) {
        const sorted = [...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const diffMs = new Date(sorted[0].createdAt) - new Date(sorted[1].createdAt);
        const diffMins = diffMs / 60000;
        if (diffMins < 60) {
            fraudSignals.push(`Rapid order velocity — ${Math.round(diffMins)} min between last 2 orders`);
        }
    }

    if (order.isCod && order.totalPrice > 2000) {
        fraudSignals.push(`High-value COD attempt (₹${order.totalPrice.toLocaleString()})`);
    }

    if (order.shippingAddress?.zip && order.billingAddress?.zip && order.shippingAddress.zip !== order.billingAddress.zip) {
        fraudSignals.push('Shipping/Billing ZIP code mismatch detected');
    }

    if (order.shippingAddress?.city && order.billingAddress?.city && order.shippingAddress.city.toLowerCase() !== order.billingAddress.city.toLowerCase()) {
        fraudSignals.push('Shipping/Billing city mismatch detected');
    }

    return {
        riskScore: risk.score,
        riskLevel: risk.level,
        riskReasons: risk.reasons,
        recommendation: risk.recommendation,
        customerStats,
        fraudSignals
    };
};
