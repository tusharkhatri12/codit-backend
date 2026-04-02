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
    syncStatus: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'failed'],
        default: 'pending'
    },
    syncProgress: {
        type: Number,
        default: 0
    },
    ordersFound: {
        type: Number,
        default: 0
    },
    customersLinked: {
        type: Number,
        default: 0
    },
    initialSyncDone: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

export default mongoose.model('Shop', shopSchema);
