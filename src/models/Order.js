import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    shop: {
        type: mongoose.Schema.ObjectId,
        ref: 'Shop',
        required: false, // Made optional temporarily for local developer standalone testing payload support
        index: true
    },
    shopifyOrderId: {
        type: String,
        required: false,
        index: true
    },
    orderNumber: {
        type: String,
        required: false
    },
    customer: {
        firstName: String,
        lastName: String,
        email: String,
        phone: String,
        isReturning: { type: Boolean, default: false }
    },
    // Explicit API root schema mappings
    phone: {
        type: String,
        required: false
    },
    messageSentAt: {
        type: Date
    },
    repliedAt: {
        type: Date
    },
    reminderSent: {
        type: Boolean,
        default: false
    },
    isNewCustomer: {
        type: Boolean,
        default: false
    },
    shippingAddress: {
        address1: String,
        city: String,
        province: String,
        zip: String,
        country: String
    },
    billingAddress: {
        address1: String,
        city: String,
        province: String,
        zip: String,
        country: String
    },
    totalPrice: {
        type: Number,
        required: false
    },
    currency: {
        type: String,
        default: 'USD'
    },
    financialStatus: {
        type: String,
        default: 'pending' // pending, paid, etc.
    },
    // Risk Engine Fields
    riskScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    riskLevel: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'SAFE'],
        default: 'LOW'
    },
    riskReasons: [{
        type: String // e.g., "Address mismatch", "High value", "New customer"
    }],
    recommendation: {
        type: String,
        enum: ['Safe', 'Review', 'Cancel'],
        default: 'Safe'
    },
    finalDecision: {
        type: String,
        enum: ['auto_confirm', 'manual_review', 'hold', 'cancel'],
        default: 'manual_review'
    },
    decisionReason: {
        type: String,
        default: ''
    },
    // Workflow tracking
    status: {
        type: String,
        enum: ['pending', 'verified', 'flagged', 'canceled', 'confirmed', 'held', 'pending_review', 'new'],
        default: 'pending'
    },
    orderStatus: {
        type: String,
        enum: ['new', 'confirmed', 'canceled', 'pending_review', 'held'],
        default: 'new'
    },
    whatsappDeliveryStatus: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'replied_yes', 'replied_no', 'failed'],
        default: 'pending'
    },
    whatsappStatus: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'confirmed', 'rejected', 'no_response'],
        default: 'pending'
    },
    whatsappMessage: {
        type: String,
        default: ''
    },
    isCod: {
        type: Boolean,
        default: true
    },
    isHeld: {
        type: Boolean,
        default: false
    },
    holdReason: {
        type: String,
        default: ''
    },
    heldAt: {
        type: Date
    },
    // Partial payment system
    paymentRequired: {
        type: Boolean,
        default: false
    },
    paymentAmount: {
        type: Number,
        default: 0
    },
    paymentLink: {
        type: String,
        default: ''
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Ensure uniqueness of order per shop
orderSchema.index({ shop: 1, shopifyOrderId: 1 }, { unique: true });

export default mongoose.model('Order', orderSchema);
