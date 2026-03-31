import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import User from '../models/User.js';

export const FEATURES = {
    starter: [
        "basic_risk_engine",
        "whatsapp_verification"
    ],
    growth: [
        "basic_risk_engine",
        "whatsapp_verification",
        "advanced_ai_risk",
        "custom_whatsapp_flows",
        "pincode_fraud_detection",
        "risk_patterns_page"
    ]
};

export const checkFeatureAccess = (featureName) => {
    return (req, res, next) => {
        // Assume req.user is set by the protect() auth middleware
        const userPlan = req.user?.plan || 'starter';

        if (!FEATURES[userPlan] || !FEATURES[userPlan].includes(featureName)) {
            console.warn(`[Access Control] Blocked user ${req.user?._id} (${userPlan}) from accessing feature: ${featureName}`);
            return res.status(403).json({
                error: "FEATURE_LOCKED",
                feature: featureName,
                message: "Upgrade to Growth plan to unlock this feature",
                currentPlan: userPlan,
                requiredPlan: "growth"
            });
        }
        
        next();
    };
};

export const requirePlan = (req, res, next) => {
    if (!req.user || !req.user.plan || req.user.plan === 'none') {
        return res.status(403).json({
            error: "PLAN_NOT_SELECTED",
            message: "A subscription plan must be selected before accessing the CODIT platform."
        });
    }
    next();
};

export const checkOrderLimit = async (shopId) => {
    try {
        if (!shopId) return;

        const shop = await Shop.findById(shopId).populate('owner');
        if (!shop || !shop.owner) return;

        const user = shop.owner;
        const userPlan = user.plan || 'starter';
        const limits = { starter: 500, growth: 2500 };

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // Find total orders created this month for this shop
        // (Assuming 1 user = 1 shop usually, but checking specifically for the shop is safer/faster)
        const allShops = await Shop.find({ owner: user._id });
        const allShopIds = allShops.map(s => s._id);

        const monthlyOrderCount = await Order.countDocuments({
            shop: { $in: allShopIds },
            createdAt: { $gte: startOfMonth }
        });

        if (monthlyOrderCount >= limits[userPlan]) {
            console.warn(`[Limit Reached] User ${user._id} (${userPlan}) crossed ${limits[userPlan]} monthly orders.`);
            throw new Error(`Plan limit exceeded. Upgrade to Growth to process more than ${limits.starter} orders/month.`);
        }
    } catch (err) {
        throw err;
    }
};
