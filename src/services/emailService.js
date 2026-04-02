import nodemailer from 'nodemailer';

/**
 * Configure Nodemailer Transporter
 */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Send Verification Email with OTP
 * @param {String} email 
 * @param {String} otp 
 */
export const sendVerificationEmail = async (email, otp) => {
    const mailOptions = {
        from: `"CODIT Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your CODIT Verification Code',
        html: `
            <div style="font-family: 'Inter', sans-serif; background-color: #0c1324; color: #dce1fb; padding: 40px; border-radius: 16px; max-width: 600px; margin: auto; border: 1px solid rgba(208, 188, 255, 0.1);">
                <h1 style="color: #d0bcff; font-size: 24px; font-weight: 800; margin-bottom: 20px;">Verify your identity</h1>
                <p style="color: #c7c4d7; font-size: 16px; line-height: 1.6;">Your CODIT verification code is below. Please enter this code in the application to activate your account.</p>
                <div style="background: rgba(208, 188, 255, 0.05); border-radius: 12px; padding: 24px; margin: 32px 0; text-align: center; border: 1px dashed rgba(208, 188, 255, 0.3);">
                    <span style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #d0bcff;">${otp}</span>
                </div>
                <p style="color: #c7c4d7; font-size: 14px; margin-bottom: 8px;"><b>Code expires in 10 minutes.</b></p>
                <p style="color: rgba(199, 196, 215, 0.4); font-size: 12px;">If you did not request this code, you can safely ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid rgba(208, 188, 255, 0.05); margin: 32px 0;">
                <p style="color: #64748b; font-size: 12px; text-align: center;">© 2024 CODIT | Deterministic Guard Protocols Active</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Email] 📧 Verification OTP sent to ${email}`);
        return true;
    } catch (error) {
        console.error(`[Email Error] ❌ Failed to send to ${email}:`, error.message);
        return error.message; // Return the specific error message
    }
};
