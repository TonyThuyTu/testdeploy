const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

//get enums for order and payment status
router.get('/enums', orderController.getOrderEnums);

//create order
router.post('/checkout', orderController.checkout);

//IPN Momo
router.post('/momo-ipn', orderController.momoIPN);

//confirm online payment manually
router.post('/confirm-payment', orderController.confirmOnlinePayment);

//get list
router.get('/', orderController.getAllOrders);

//get list order by id
router.get("/customer/:id", orderController.getOrdersByCustomerId);

//get detail order
router.get('/:id', orderController.getOrderDetail);

//update order
router.patch('/:id', orderController.updateOrderStatus);

module.exports = router;