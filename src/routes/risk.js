import express from 'express';
import { getRiskPatterns } from '../controllers/riskController.js';
import { protect } from '../middlewares/auth.js';
import { checkFeatureAccess, requirePlan } from '../middlewares/features.js';

const router = express.Router();

router.use(protect, requirePlan); // Secure API

router.get('/patterns', checkFeatureAccess('risk_patterns_page'), getRiskPatterns);

export default router;
