const express = require('express');
const router = express.Router();
const shippingController = require('../controllers/shipping.controller');

// Get shipping information for an order
router.get('/:orderId', shippingController.getShippingInfo);

// Start shipping simulation for an order
router.post('/start/:orderId', shippingController.startShippingSimulation);

// Stop shipping simulation for an order
router.post('/stop/:orderId', shippingController.stopShippingSimulation);

// Simulate delivery failure for an order (for testing)
router.post('/simulate-failure/:orderId', shippingController.simulateDeliveryFailure);

module.exports = router;
