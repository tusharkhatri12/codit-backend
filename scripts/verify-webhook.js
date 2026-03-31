import fetch from 'node-fetch';

const WEBHOOK_URL = 'http://localhost:5000/api/webhooks/shopify/order-created';

const mockShopifyPayload = {
    id: 1234567890,
    order_number: 1001,
    shop_domain: 'mystore.myshopify.com', // fallback if header missing
    total_price: '1599.00',
    currency: 'INR',
    gateway: 'Cash on Delivery (COD)',
    payment_gateway_names: ['manual', 'Cash on Delivery'],
    customer: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        phone: '+919876543210',
        orders_count: 1
    },
    shipping_address: {
        address1: '123 Fake St',
        city: 'Mumbai',
        province: 'Maharashtra',
        zip: '400001',
        country: 'India',
        phone: '+919876543210'
    },
    billing_address: {
        address1: '123 Fake St',
        city: 'Mumbai',
        province: 'Maharashtra',
        zip: '400001',
        country: 'India'
    }
};

async function testWebhook() {
    console.log('🚀 Sending mock Shopify webhook to:', WEBHOOK_URL);
    
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Shop-Domain': 'mystore.myshopify.com',
                'X-Shopify-Hmac-Sha256': 'mock-hmac-for-testing'
            },
            body: JSON.stringify(mockShopifyPayload)
        });

        const data = await response.json();
        console.log('📥 Response Status:', response.status);
        console.log('📥 Response Body:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('✅ Webhook verification SUCCESSFUL!');
        } else {
            console.warn('❌ Webhook verification FAILED (Expected 404 if shop not in DB, 200 if it is).');
        }
    } catch (error) {
        console.error('❌ Network error:', error.message);
    }
}

testWebhook();
