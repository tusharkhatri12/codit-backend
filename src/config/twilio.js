import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const isValidTwilioUser = accountSid && accountSid.startsWith('AC') && authToken && authToken !== 'your_token';

// Throw warnings if missing, but do not crash the initialization
if (!isValidTwilioUser) {
    console.warn('⚠️ Valid TWILIO_ACCOUNT_SID (starts with AC) and TWILIO_AUTH_TOKEN are missing from .env');
    console.warn('⚠️ Twilio WhatsApp services will return mock errors unless correctly configured.');
}

export const twilioClient = isValidTwilioUser ? twilio(accountSid, authToken) : null;
export const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
