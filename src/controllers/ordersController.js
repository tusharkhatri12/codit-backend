import Order from '../models/Order.js';
import Shop from '../models/Shop.js';
import { analyzeOrderIntelligence } from '../modules/risk/riskEngine.js';
import { applyDecision } from '../modules/risk/decisionEngine.js';
import { queueWhatsAppConfirmation } from '../queues/whatsappQueue.js';
import { createPaymentLink } from '../services/paymentService.js';

// @desc    Get all orders
// @route   GET /api/orders
export const getOrders = async (req, res) => {
    try {
        const shops = await Shop.find({ owner: req.user._id });
        const shopIds = shops.map(shop => shop._id);
        
        const { riskLevel, orderStatus, search, page = 1, limit = 50 } = req.query;
        const query = { shop: { $in: shopIds } };

        if (riskLevel === 'HIGH') {
            // "Flagged" tab: Show unresolved High/Critical risk orders
            query.riskLevel = { $in: ['HIGH', 'CRITICAL'] };
            query.orderStatus = { $in: ['new', 'pending_review', 'held'] };
        } else if (riskLevel) {
            query.riskLevel = riskLevel;
        }
        
        if (orderStatus) {
            query.orderStatus = orderStatus;
        } else if (!riskLevel && !search) {
            // General "All Orders" view or other filters
        }
        if (search) {
            query.$or = [
                { orderNumber: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({ 
            success: true, 
            count: orders.length,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            },
            data: orders 
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get single order
// @route   GET /api/orders/:id
export const getOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('shop');
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
        
        res.status(200).json({ success: true, data: order });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
export const updateOrderStatus = async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.status(200).json({ success: true, data: order });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Export orders as CSV
// @route   GET /api/orders/export
export const exportOrders = async (req, res) => {
    try {
        const shops = await Shop.find({ owner: req.user._id });
        const shopIds = shops.map(shop => shop._id);
        const orders = await Order.find({ shop: { $in: shopIds } });
        
        // Mock CSV generation for now
        res.status(200).json({ success: true, message: 'Export logic ready', count: orders.length });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Manual hold an order
// @route   POST /api/orders/:id/hold
export const holdOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        order.orderStatus = 'held';
        order.status = 'held';
        order.isHeld = true;
        order.holdReason = req.body.reason || 'Manual Hold';
        await order.save();

        res.status(200).json({ success: true, data: order });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Release order
export const releaseOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        order.orderStatus = 'confirmed';
        order.status = 'confirmed';
        order.isHeld = false;
        await order.save();

        // If it's a demo order, don't use real BullMQ/Redis queue
        const isDemo = order.shopifyOrderId && order.shopifyOrderId.startsWith('demo_');
        
        if (isDemo) {
            order.whatsappStatus = 'sent';
            await order.save();
        } else if (order.phone) {
            try {
                await queueWhatsAppConfirmation(order);
            } catch (err) {
                console.warn('[Queue] Failed to add job. Redis might be down:', err.message);
                // We DON'T throw here so the 200 response still goes through
            }
        }

        res.status(200).json({ success: true, message: 'Order released', data: order });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Cancel order
export const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        order.orderStatus = 'canceled';
        order.status = 'canceled';
        order.isHeld = false;
        await order.save();

        res.status(200).json({ success: true, message: 'Order canceled', data: order });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get held orders
export const getHeldOrders = async (req, res) => {
    try {
        const shops = await Shop.find({ owner: req.user._id });
        const shopIds = shops.map(shop => shop._id);
        const orders = await Order.find({ shop: { $in: shopIds }, isHeld: true });
        
        res.status(200).json({ success: true, data: orders });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Create manual demo order
export const createDemoOrder = async (req, res) => {
    try {
        const { phone, totalPrice, isNewCustomer, shippingAddress, billingAddress } = req.body;

        let shop = await Shop.findOne({ owner: req.user._id, domain: /^demo-/ });
        if (!shop) {
            shop = await Shop.create({
                domain: `demo-${req.user._id.toString().slice(-4)}.myshopify.com`,
                accessToken: `demo_token_${Date.now()}`,
                owner: req.user._id,
                isActive: true
            });
        }

        const price = parseFloat(totalPrice);
        const orderData = {
            shop: shop._id,
            shopifyOrderId: `demo_${Date.now()}`,
            orderNumber: `CD-${Math.floor(10000 + Math.random() * 90000)}`,
            phone: phone || '+919999999999',
            totalPrice: isNaN(price) ? 0 : price,
            isNewCustomer: !!isNewCustomer,
            isCod: true,
            status: 'pending',
            orderStatus: 'new',
            shippingAddress: { city: shippingAddress?.city || 'Delhi', country: 'India' },
            billingAddress: { city: billingAddress?.city || 'Mumbai', country: 'India' }
        };

        const order = await Order.create(orderData);
        const analysis = await analyzeOrderIntelligence(order, shop);
        
        order.riskScore = analysis.riskScore;
        order.riskLevel = analysis.riskLevel;
        order.riskReasons = analysis.riskReasons;
        order.recommendation = analysis.recommendation;
        
        // 4. WhatsApp Simulation (Demo only)
        order.whatsappMessage = `Hi! Please confirm your COD order of ₹${order.totalPrice.toLocaleString()}. Reply YES to confirm or NO to cancel.`;
        order.whatsappStatus = 'sent';
        
        if (order.riskScore > 40) { // Lowered threshold to include High Risk in Held component
            order.isHeld = true;
            order.holdReason = 'Fraud Risk';
            
            // --- NEW: Trigger Partial Payment for Demo ---
            if (order.riskScore > 70) {
                order.paymentRequired = true;
                order.paymentAmount = 100;
                order.paymentStatus = 'pending';
                
                try {
                    const shortUrl = await createPaymentLink(order, order.paymentAmount);
                    order.paymentLink = shortUrl;
                    console.log(`[Demo] ✅ Generated Payment Link: ${shortUrl}`);
                } catch (err) {
                    console.error('[Demo] ❌ Link generation failed:', err.message);
                }
            }
        }

        await order.save();
        res.status(201).json({ success: true, data: order });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get detailed order intelligence
export const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('shop', 'domain owner');
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        const analysis = await analyzeOrderIntelligence(order);

        res.status(200).json({
            success: true,
            data: {
                orderId: order.orderNumber || order._id,
                phone: order.phone || 'N/A',
                totalPrice: order.totalPrice,
                orderStatus: order.orderStatus,
                riskScore: analysis.riskScore,
                riskLevel: analysis.riskLevel,
                riskReasons: analysis.riskReasons,
                recommendation: analysis.recommendation,
                whatsappStatus: order.whatsappStatus,
                whatsappMessage: order.whatsappMessage,
                paymentRequired: order.paymentRequired,
                paymentAmount: order.paymentAmount,
                paymentLink: order.paymentLink,
                paymentStatus: order.paymentStatus,
                isHeld: order.isHeld,
                _id: order._id,
                createdAt: order.createdAt
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Simulate WhatsApp Reply (Demo Mode)
// @route   POST /api/orders/:id/simulate-reply
export const simulateReply = async (req, res) => {
    try {
        const { reply } = req.body; // YES or NO
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // 1. Update Simulation State
        order.repliedAt = new Date();
        order.whatsappStatus = reply === 'YES' ? 'confirmed' : 'rejected';
        order.whatsappDeliveryStatus = reply === 'YES' ? 'replied_yes' : 'replied_no';

        // 2. Run Decision Engine
        const decision = applyDecision(order, reply);
        
        order.finalDecision = decision.finalDecision;
        order.decisionReason = decision.decisionReason;
        order.orderStatus = decision.orderStatus;
        order.status = decision.orderStatus; // Sync legacy 'status' field
        order.isHeld = decision.isHeld;

        if (decision.isHeld) {
            order.heldAt = new Date();
        }

        await order.save();

        res.status(200).json({ 
            success: true, 
            message: `Simulated ${reply} reply processed`,
            data: order 
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
