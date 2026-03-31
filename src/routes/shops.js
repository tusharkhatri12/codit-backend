import express from 'express';
import { connectShop, getMyShops } from '../controllers/shopsController.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.use(protect); // All shop routes protected

router.route('/')
    .get(getMyShops);

router.post('/connect', connectShop);

export default router;
