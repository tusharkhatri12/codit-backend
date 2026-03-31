import express from 'express';
import { getAnalyticsSummary, getSystemMetrics } from '../controllers/analyticsController.js';
import { protect } from '../middlewares/auth.js';
import { requirePlan } from '../middlewares/features.js';

const router = express.Router();

router.use(protect, requirePlan);

router.get('/summary', getAnalyticsSummary);
router.get('/system-metrics', getSystemMetrics);

export default router;
