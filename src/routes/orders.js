import express from 'express';
import { getOrders, getOrder, updateOrderStatus, exportOrders, holdOrder, releaseOrder, cancelOrder, getHeldOrders, getOrderDetails, createDemoOrder, simulateReply } from '../controllers/ordersController.js';
import { protect } from '../middlewares/auth.js';
import { requirePlan } from '../middlewares/features.js';

const router = express.Router();

router.use(protect, requirePlan); // All order routes protected

router.route('/')
    .get(getOrders);

router.route('/export')
    .get(exportOrders);

router.route('/held')
    .get(getHeldOrders);

router.route('/demo-create')
    .post(createDemoOrder);

router.route('/:id')
    .get(getOrder);

router.route('/:id/status')
    .put(updateOrderStatus);

router.route('/:id/hold')
    .post(holdOrder);

router.route('/:id/release')
    .post(releaseOrder);

router.route('/:id/cancel')
    .post(cancelOrder);

router.route('/:id/details')
    .get(getOrderDetails);

router.route('/:id/simulate-reply')
    .post(simulateReply);

export default router;
