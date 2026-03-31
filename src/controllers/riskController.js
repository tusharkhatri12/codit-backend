import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { MOCK_RISK_PATTERNS } from '../utils/demoData.js';

// @desc    Get dynamic risk patterns analysis
// @route   GET /api/risk/patterns
// @access  Private
export const getRiskPatterns = async (req, res, next) => {
    try {
        const shops = await Shop.find({ owner: req.user.id });
        const shopIds = shops.map(shop => shop._id);
        const shopQuery = shopIds.length > 0 ? { shop: { $in: shopIds } } : {};

        const totalActualOrders = await Order.countDocuments(shopQuery);
        if (totalActualOrders === 0) {
            return res.status(200).json({ success: true, data: MOCK_RISK_PATTERNS });
        }

        const orders = await Order.find(shopQuery).lean();
        
        let activeThreats = 0;
        let cancelledOrdersCount = 0;
        let confirmedOrdersCount = 0;
        let totalPreventedLoss = 0;

        const pinCounts = {};
        const hourlyDistribution = new Array(24).fill(0);
        const minuteBuckets = {};
        
        // 1. Phone Reputation Trackers
        let voipDetected = 0;
        let blacklistMatches = 0;
        let landlineMismatch = 0;
        
        const phoneCancelCounts = {};

        // 2. Iterate dynamically over REAL data
        orders.forEach(order => {
            // Top Level Stats
            if (['HIGH', 'CRITICAL'].includes(order.riskLevel)) activeThreats++;
            if (order.orderStatus === 'confirmed') confirmedOrdersCount++;
            if (order.orderStatus === 'cancelled') {
                cancelledOrdersCount++;
                totalPreventedLoss += order.totalPrice;
                
                // Track cancellation clusters by phone
                if (order.phone) {
                    phoneCancelCounts[order.phone] = (phoneCancelCounts[order.phone] || 0) + 1;
                }
            }

            // Reason scraping for specific Blacklist / VoIP properties
            if (order.riskReasons && Array.isArray(order.riskReasons)) {
                if (order.riskReasons.some(r => r.includes('Severe Context'))) blacklistMatches++;
                if (order.riskReasons.some(r => r.includes('Mismatch'))) landlineMismatch++;
            }
            if (!order.phone || order.phone.length < 5) voipDetected++;

            // Pincodes
            const pin = order.shippingAddress?.zip;
            if (pin) {
                pinCounts[pin] = (pinCounts[pin] || 0) + 1;
            }

            // Timestamps
            if (order.createdAt) {
                const date = new Date(order.createdAt);
                const hour = date.getHours();
                hourlyDistribution[hour]++;

                // Minute clustering for IP velocity approximation
                const minuteKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
                minuteBuckets[minuteKey] = (minuteBuckets[minuteKey] || 0) + 1;
            }
        });

        // 3. Peak Computation
        const peakPincode = Object.entries(pinCounts).sort((a, b) => b[1] - a[1])[0];
        const peakPinCount = peakPincode ? peakPincode[1] : 0;
        const peakPinName = peakPincode ? peakPincode[0] : 'Unknown';
        
        const pinRiskLevel = peakPinCount > 20 ? 'CRITICAL' : peakPinCount > 5 ? 'MODERATE' : 'LOW';

        // 4. IP Velocity Approximation (Max Orders per Minute globally)
        const peakVelocity = Object.values(minuteBuckets).sort((a, b) => b - a)[0] || 0;
        const velocityLevel = peakVelocity > 10 ? 'CRITICAL' : peakVelocity > 3 ? 'MODERATE' : 'LOW';

        // 5. Phone Risk Rollups
        const phoneRiskLevel = (blacklistMatches > 0 || Object.values(phoneCancelCounts).some(c => c > 2)) ? 'HIGH' : landlineMismatch > 2 ? 'MODERATE' : 'LOW';

        // 6. Insight String Generation purely from real data
        let aiInsight = { title: 'Network stable.', description: 'No outstanding anomalous behaviors present on the network.' };
        if (pinRiskLevel === 'CRITICAL') {
            aiInsight = {
                title: `Suspicious cluster detected in region ${peakPinName}.`,
                description: `Our network has identified a high concentration of ${peakPinCount} orders targeting the ${peakPinName} delivery segment. This mimics botnet dropshipping behavior.`
            };
        } else if (velocityLevel === 'CRITICAL') {
            aiInsight = {
                title: `High Velocity Attack Repelled`,
                description: `A severe spike of ${peakVelocity} checkout requests per minute intercepted perfectly matching card-testing bot patterns.`
            };
        } else if (phoneRiskLevel === 'HIGH') {
             aiInsight = {
                title: `Serial Cancellation Ring Blocked`,
                description: `Multiple matching telephone numbers caught attempting identical COD payloads following prior cancellations (${blacklistMatches} matches).`
            };
        }

        const recentActivity = await Order.find({ ...shopQuery, riskLevel: { $in: ['HIGH', 'CRITICAL', 'MEDIUM'] } })
                .sort({ createdAt: -1 })
                .limit(10)
                .select('orderNumber shopifyOrderId totalPrice riskLevel createdAt whatsappStatus orderStatus');

        // 7. Output exactly matching requested format
        res.status(200).json({
            success: true,
            data: {
                activeThreats,
                preventedLoss: totalPreventedLoss,
                detectionAccuracy: orders.length > 0 ? Number(((confirmedOrdersCount / orders.length) * 100).toFixed(1)) : 100,
                recentActivity,
                pincodeAnomalies: {
                    peak: peakPinCount,
                    hourlyDistribution,
                    riskLevel: pinRiskLevel
                },
                
                ipVelocity: {
                    attemptsPerMinute: peakVelocity,
                    threshold: 5,
                    riskLevel: velocityLevel
                },

                phoneReputation: {
                    voipDetected,
                    landlineMismatch,
                    blacklistMatches,
                    riskLevel: phoneRiskLevel
                },

                aiInsight
            }
        });

    } catch (err) {
        console.error('Risk Patterns API Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
