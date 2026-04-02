import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { sendVerificationEmail } from '../services/emailService.js';

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
            isOnboarded: user.isOnboarded,
            emailVerified: user.emailVerified
        }
    });
};

// @desc    Send OTP to email
// @route   POST /api/auth/send-otp
// @access  Public
export const sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        user.otp = otp;
        user.otpExpiry = otpExpiry;
        await user.save();

        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.status(500).json({ success: false, error: 'Failed to send verification email' });
        }

        res.status(200).json({ success: true, message: 'OTP sent to email' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
export const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email }).select('+otp +otpExpiry');

        if (!user || user.otp !== otp || user.otpExpiry < new Date()) {
            return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
        }

        user.emailVerified = true;
        user.otp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        res.status(200).json({ success: true, message: 'Email verified successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Handle Google Auth Callback
// @route   GET /api/auth/google/callback
// @access  Public
export const googleCallback = (req, res) => {
    // Passport adds user to req.user after successful strategy execution
    const user = req.user;
    
    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Redirect to frontend with token
    // We'll handle this on the frontend in a new AuthSuccess page
    res.redirect(`${frontendUrl}/auth/success?token=${token}&user=${encodeURIComponent(JSON.stringify({
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        mode: user.mode,
        isOnboarded: user.isOnboarded,
        emailVerified: user.emailVerified
    }))}`);
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
            role,
            plan: 'starter',
            isOnboarded: true,
            emailVerified: false // Explicitly false until OTP
        });

        // Generate and send initial OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
        await sendVerificationEmail(email, otp);

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

        if (!user.emailVerified) {
            return res.status(403).json({ 
                success: false, 
                error: 'Please verify your email before logging in',
                unverified: true 
            });
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
