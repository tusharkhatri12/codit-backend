import User from '../models/User.js';
import jwt from 'jsonwebtoken';

// Helper to get token from model, create cookie and send res
const sendTokenResponse = (user, statusCode, res) => {
    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d' // 30 days
    });

    res.status(statusCode).json({
        success: true,
        token,
        user: {
            userId: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            plan: user.plan,
            mode: user.mode,
            isOnboarded: user.isOnboarded
        }
    });
};

// @desc    Register a user
// @route   POST /api/auth/signup
// @access  Public
export const signup = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, error: 'User already exists with this email' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role
        });

        sendTokenResponse(user, 201, res);
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Login a user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide an email and password' });
        }

        // Check user
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Check if password matches
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        sendTokenResponse(user, 200, res);
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
    const user = await User.findById(req.user.id);
    res.status(200).json({
        success: true,
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        mode: user.mode,
        isOnboarded: user.isOnboarded
    });
};
