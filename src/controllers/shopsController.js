import Shop from '../models/Shop.js';

// @desc    Connect a Shopify Store (Mock OAuth Flow)
// @route   POST /api/shops/connect
// @access  Private
export const connectShop = async (req, res, next) => {
    try {
        const { domain, accessToken } = req.body;

        if (!domain) {
            return res.status(400).json({ success: false, error: 'Shopify domain is required' });
        }

        let shop = await Shop.findOne({ domain });

        if (shop) {
            // Update token if provided
            if (accessToken) {
                shop.accessToken = accessToken;
                await shop.save();
            }
            
            // If it exists, ensure the current user owns it
            if (shop.owner.toString() !== req.user.id && req.user.role !== 'admin') {
                return res.status(401).json({ success: false, error: 'Not authorized to connect this shop' });
            }
        } else {
            // Use provided token or create a mock token
            const finalAccessToken = accessToken || `shpca_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
            
            shop = await Shop.create({
                domain,
                accessToken: finalAccessToken,
                owner: req.user.id
            });
        }

        res.status(200).json({
            success: true,
            data: shop
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get user's connected shops
// @route   GET /api/shops
// @access  Private
export const getMyShops = async (req, res, next) => {
    try {
        const shops = await Shop.find({ owner: req.user.id });

        res.status(200).json({
            success: true,
            count: shops.length,
            data: shops
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
