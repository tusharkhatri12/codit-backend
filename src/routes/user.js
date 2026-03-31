import express from 'express';
import { protect } from '../middlewares/auth.js';
import { FEATURES } from '../middlewares/features.js';
import User from '../models/User.js';

const router = express.Router();

// @desc    Get current user plan and allowed features
// @route   GET /api/user/plan
// @access  Private
router.get('/plan', protect, (req, res) => {
    const userPlan = req.user.plan || 'starter';
    const allowedFeatures = FEATURES[userPlan] || [];

    res.status(200).json({
        success: true,
        plan: userPlan,
        allowedFeatures
    });
});

// @desc    Select Subscription Plan
// @route   POST /api/user/select-plan
// @access  Private
router.post('/select-plan', protect, async (req, res) => {
    try {
        const { plan } = req.body;
        
        if (!['starter', 'growth'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan selected. Choose starter or growth.' });
        }
        
        // Mark user as onboarded successfully tracking payment or basic choices natively.
        req.user.plan = plan;
        req.user.isOnboarded = true;
        await req.user.save();

        res.status(200).json({
            message: "Plan selected successfully",
            plan: req.user.plan,
            mode: req.user.mode,
            isOnboarded: req.user.isOnboarded
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @desc    Upgrade Subscription Plan
// @route   POST /api/user/upgrade
// @access  Private
router.post('/upgrade', protect, async (req, res) => {
    try {
        const { plan } = req.body;
        
        if (plan !== 'growth') {
            return res.status(400).json({ error: 'Only growth plan is supported for this upgrade path currently.' });
        }

        const oldPlan = req.user.plan || 'none';
        
        // Simulate payment interaction
        console.log(`[Billing] 💳 Payment simulated for User ${req.user._id}`);
        console.log(`[Billing] 🔄 Upgrading User ${req.user._id} | Old Plan: ${oldPlan} | New Plan: ${plan}`);
        
        req.user.plan = plan;
        await req.user.save();

        res.status(200).json({
            message: "Plan upgraded successfully",
            plan: req.user.plan
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @desc    Switch User Mode (demo/live)
// @route   POST /api/user/switch-mode
// @access  Private
router.post('/switch-mode', protect, async (req, res) => {
    try {
        const { mode } = req.body;
        
        if (!['demo', 'live'].includes(mode)) {
            return res.status(400).json({ error: 'Invalid mode. Use demo or live.' });
        }
        
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { mode },
            { new: true, runValidators: false }
        );
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        console.log(`[Mode Switch] 🔄 User ${user._id} switched to ${mode.toUpperCase()} mode.`);

        res.status(200).json({
            success: true,
            message: `Switched to ${mode} mode successfully`,
            mode: user.mode
        });
        
    } catch (err) {
        console.error('[Switch Mode Error]', err);
        const errorMessage = err.errors ? Object.values(err.errors).map(e => e.message).join(', ') : err.message;
        res.status(500).json({ 
            success: false, 
            details: err.errors ? err.errors : undefined
        });
    }
});

export default router;
