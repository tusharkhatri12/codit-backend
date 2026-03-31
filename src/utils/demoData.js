export const generateMockOrders = () => {
    const orders = [];
    const statuses = ['new', 'confirmed', 'cancelled'];
    const risks = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const whatsapps = ['sent', 'confirmed', 'failed', 'no_response'];
    const names = ['Alex Rivers', 'Jamie Doe', 'Morgan Smith', 'Taylor Swift', 'Jordan Lee', 'Riley Day'];
    
    for (let i = 0; i < 15; i++) {
        const riskScore = Math.floor(Math.random() * 100);
        let riskLvl = 'LOW';
        if (riskScore > 85) riskLvl = 'CRITICAL';
        else if (riskScore > 70) riskLvl = 'HIGH';
        else if (riskScore > 30) riskLvl = 'MEDIUM';

        orders.push({
            _id: `mock-${i}`,
            orderNumber: `MOCK-${1000 + i}`,
            phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            totalPrice: Math.floor(Math.random() * 15000) + 500,
            riskLevel: riskLvl,
            riskScore: riskScore,
            whatsappDeliveryStatus: whatsapps[Math.floor(Math.random() * whatsapps.length)],
            orderStatus: statuses[Math.floor(Math.random() * statuses.length)],
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString(),
            customer: {
                firstName: names[Math.floor(Math.random() * names.length)].split(' ')[0],
                lastName: names[Math.floor(Math.random() * names.length)].split(' ')[1],
            }
        });
    }

    // Sort by descending created date natively
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

export const MOCK_ANALYTICS = {
    totalOrders: 15,
    confirmedOrders: 9,
    cancelledOrders: 3,
    pendingOrders: 3,
    highRiskOrders: 2,
    mediumRiskOrders: 5,
    lowRiskOrders: 8,
    confirmationRate: 60.0,
    cancellationRate: 20.0,
    estimatedRtoSaved: 8500,
    recentActivity: [],
    isDemoData: true
};

export const MOCK_RISK_PATTERNS = {
    activeThreats: 2,
    preventedLoss: 12500,
    detectionAccuracy: 99.4,
    pincodeAnomalies: { peak: 45, hourlyDistribution: new Array(24).fill(0).map(() => Math.floor(Math.random() * 20)), riskLevel: 'MODERATE' },
    ipVelocity: { attemptsPerMinute: 12, threshold: 5, riskLevel: 'CRITICAL' },
    phoneReputation: { voipDetected: 8, landlineMismatch: 3, blacklistMatches: 1, riskLevel: 'HIGH' },
    aiInsight: { title: 'Velocity Anomaly Detected', description: 'Unusual spike in checkout attempts from a single subnet in the last 15 minutes.' },
    recentActivity: [],
    isDemoData: true
};
