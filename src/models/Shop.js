import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema({
    domain: {
        type: String,
        required: [true, 'Shopify domain is required'],
        unique: true,
        index: true
    },
    accessToken: {
        type: String,
        required: [true, 'Shopify access token is required']
    },
    owner: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    whatsappConfig: {
        enabled: { type: Boolean, default: true },
        templateId: { type: String }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Shop', shopSchema);
