
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './src/models/Order.js';

dotenv.config();

async function repair() {
    try {
        console.log('Connecting to:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        
        // 1. Find all High/Critical risk orders that are 'pending' or 'new' and mark them as 'held'
        const result = await Order.updateMany(
            { 
                riskLevel: { $in: ['HIGH', 'CRITICAL'] },
                orderStatus: { $in: ['new', 'pending', 'pending_review'] }
            }, 
            { 
                $set: { 
                    isHeld: true, 
                    orderStatus: 'held',
                    status: 'held'
                } 
            }
        );
        
        console.log('Successfully repaired orders:', result.modifiedCount);
        
        // 2. Check how many held orders exist total
        const totalHeld = await Order.countDocuments({ isHeld: true });
        console.log('Total held orders in DB now:', totalHeld);

        process.exit(0);
    } catch (err) {
        console.error('Repair failed:', err);
        process.exit(1);
    }
}

repair();
