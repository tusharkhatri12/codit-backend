import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

const configurePassport = () => {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
        proxy: true // Required for Render/Heroku HTTPS
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            
            // Check if user exists
            let user = await User.findOne({ email });

            if (user) {
                // If user exists, ensure email is verified
                if (!user.emailVerified) {
                    user.emailVerified = true;
                    await user.save();
                }
                return done(null, user);
            }

            // Create new user if not exists
            user = await User.create({
                name: profile.displayName,
                email: email,
                password: Math.random().toString(36).slice(-10), // Random placeholder
                emailVerified: true,
                plan: 'starter',
                isOnboarded: true,
                mode: 'demo'
            });

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }));

    // No need for session serialization since we use JWT
};

export default configurePassport;
