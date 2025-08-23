const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');

router.get('/dashboard', analyticsController.getDashboardData);
router.get('/revenue', analyticsController.getRevenueChart);
router.get('/top-products', analyticsController.getTopProducts);
router.get('/detailed-stats', analyticsController.getDetailedStats);

module.exports = router;