import express from 'express';
import { connectShop, getMyShops, getSyncStatus } from '../controllers/shopsController.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.get('/sync-status', getSyncStatus); // Public check with shop domain

router.use(protect); // Other shop routes protected

router.route('/')
    .get(getMyShops);

router.post('/connect', connectShop);

export default router;
