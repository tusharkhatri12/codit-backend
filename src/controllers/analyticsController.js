import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { MOCK_ANALYTICS } from '../utils/demoData.js';

// @desc    Get combined analytics summary
// @route   GET /api/analytics/summary
// @access  Private
export const getAnalyticsSummary = async (req, res, next) => {
    try {
        const shops = await Shop.find({ owner: req.user._id });
        const shopIds = shops.map(shop => shop._id);

        // Fallback for independent local development avoiding complex shop IDs inherently 
        const shopQuery = shopIds.length > 0 ? { shop: { $in: shopIds } } : {};

        const totalActualOrders = await Order.countDocuments(shopQuery);
        if (totalActualOrders === 0) {
            return res.status(200).json({ success: true, data: MOCK_ANALYTICS });
        }

        // 1. Gather comprehensive order pools natively bridging global constraints
        // We use exclusive logic so a settled order (confirmed/canceled) doesn't stay in the "High Risk/Flagged" action bin
        const [
            totalOrders,
            confirmedOrders,
            canceledOrders,
            pendingOrders,
            highRiskOrders,
            mediumRiskOrders,
            lowRiskOrders,
            recentActivity
        ] = await Promise.all([
            Order.countDocuments({ ...shopQuery }),
            Order.countDocuments({ ...shopQuery, orderStatus: 'confirmed' }),
            Order.countDocuments({ ...shopQuery, orderStatus: 'canceled' }),
            Order.countDocuments({ ...shopQuery, orderStatus: { $in: ['new', 'pending_review', 'held'] } }),
            Order.countDocuments({ ...shopQuery, riskLevel: { $in: ['HIGH', 'CRITICAL'] }, orderStatus: { $in: ['new', 'pending_review', 'held'] } }),
            Order.countDocuments({ ...shopQuery, riskLevel: 'MEDIUM', orderStatus: { $in: ['new', 'pending_review', 'held'] } }),
            Order.countDocuments({ ...shopQuery, riskLevel: { $in: ['LOW', 'SAFE'] }, orderStatus: { $in: ['new', 'pending_review', 'held'] } }),
            // Retain recent activity for UI tables inherently without breaking loops
            Order.find({ ...shopQuery })
                .sort({ createdAt: -1 })
                .limit(10)
                .select('orderNumber shopifyOrderId totalPrice riskLevel createdAt whatsappStatus orderStatus')
        ]);

        // 2. Fixed explicit business computation natively executing exactly (Canceled * ₹100 per RTO average)
        const estimatedRtoSaved = canceledOrders * 100;
        
        const confirmationRate = totalOrders > 0 ? ((confirmedOrders / totalOrders) * 100).toFixed(1) : 0;
        const cancellationRate = totalOrders > 0 ? ((canceledOrders / totalOrders) * 100).toFixed(1) : 0;

        // 3. Render standardized payload mappings cleanly
        res.status(200).json({
            success: true,
            data: {
                totalOrders,
                confirmedOrders,
                canceledOrders,
                pendingOrders,
                highRiskOrders,
                mediumRiskOrders,
                lowRiskOrders,
                confirmationRate: Number(confirmationRate),
                cancellationRate: Number(cancellationRate),
                estimatedRtoSaved,
                recentActivity // Appended exclusively to prevent UI table `.map` destructured crashes internally
            }
        });

    } catch (err) {
        console.error('Analytics Error:', err);
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get system performance metrics
// @route   GET /api/analytics/system-metrics
// @access  Private
export const getSystemMetrics = async (req, res) => {
    try {
        const shops = await Shop.find({ owner: req.user._id });
        const shopIds = shops.map(shop => shop._id);
        const shopQuery = shopIds.length > 0 ? { shop: { $in: shopIds } } : {};

        const totalOrders = await Order.countDocuments(shopQuery);

        // If no real data, return sensible demo defaults
        if (totalOrders === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    aiCatchRate: 99.4,
                    preventedLoss: 12482,
                    systemHealth: 'Optimal',
                    aiNodesActive: 3,
                    weeklyImprovement: 2.1,
                    flaggedAttempts: 14,
                    isDemoData: true
                }
            });
        }

        // --- AI Catch Rate ---
        const confirmed = await Order.countDocuments({ ...shopQuery, orderStatus: 'confirmed' });
        const canceled = await Order.countDocuments({ ...shopQuery, orderStatus: 'canceled' });
        const processed = confirmed + canceled;
        const aiCatchRate = processed > 0 ? Number(((confirmed / processed) * 100).toFixed(1)) : 0;

        // --- Prevented Loss ---
        const canceledOrders = await Order.find({ ...shopQuery, orderStatus: 'canceled' }).select('totalPrice');
        const preventedLoss = canceledOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        // --- Flagged Attempts ---
        // Only count those that still need resolved attention to signify active threat monitoring
        const flaggedAttempts = await Order.countDocuments({ ...shopQuery, riskLevel: { $in: ['HIGH', 'CRITICAL'] }, orderStatus: { $in: ['new', 'pending_review', 'held'] } });

        // --- System Health ---
        const failedWhatsapp = await Order.countDocuments({ ...shopQuery, whatsappDeliveryStatus: 'failed' });
        const pendingOrders = await Order.countDocuments({ ...shopQuery, orderStatus: 'new' });
        
        let systemHealth = 'Optimal';
        if (failedWhatsapp > totalOrders * 0.3 || (pendingOrders > totalOrders * 0.7 && totalOrders > 5)) {
            systemHealth = 'Critical';
        } else if (failedWhatsapp > totalOrders * 0.1 || pendingOrders > totalOrders * 0.5) {
            systemHealth = 'Moderate';
        }

        // --- AI Nodes (simulated) ---
        const aiNodesActive = Math.min(3 + Math.floor(totalOrders / 50), 5);

        // --- Weekly Improvement ---
        const now = new Date();
        const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

        const thisWeekConfirmed = await Order.countDocuments({
            ...shopQuery, orderStatus: 'confirmed',
            createdAt: { $gte: oneWeekAgo }
        });
        const thisWeekTotal = await Order.countDocuments({
            ...shopQuery,
            createdAt: { $gte: oneWeekAgo }
        });
        const lastWeekConfirmed = await Order.countDocuments({
            ...shopQuery, orderStatus: 'confirmed',
            createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
        });
        const lastWeekTotal = await Order.countDocuments({
            ...shopQuery,
            createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
        });

        const thisWeekRate = thisWeekTotal > 0 ? (thisWeekConfirmed / thisWeekTotal) * 100 : 0;
        const lastWeekRate = lastWeekTotal > 0 ? (lastWeekConfirmed / lastWeekTotal) * 100 : 0;
        const weeklyImprovement = Number((thisWeekRate - lastWeekRate).toFixed(1));

        console.log(`[SYSTEM METRICS] User ${req.user.id} | CatchRate: ${aiCatchRate}% | Health: ${systemHealth}`);

        res.status(200).json({
            success: true,
            data: {
                aiCatchRate,
                preventedLoss,
                systemHealth,
                aiNodesActive,
                weeklyImprovement,
                flaggedAttempts
            }
        });
    } catch (err) {
        console.error('System Metrics Error:', err);
        res.status(400).json({ success: false, error: err.message });
    }
};
