const express = require('express');
const router = express.Router();

// Import route con
const categoryRoute = require('./categories.route');

const productRoute = require('./products.route');
const productVariantsRoute = require('./productVariants.route'); // NEW VARIANTS ROUTE

const contactRoute = require('./contact.route');

const customerRoute = require('./customer.route');

const bannerRoute = require('./banner.route');

const EmployeeRoute = require('./employee.route');

const UserAddress = require('./userAddress.route');

const ReviewsRoute = require('./review.route');

const VoucherRoute = require('./voucher.route');

const CartRoute = require('./cart.route');

const CheckoutRoute = require('./order.route');

const ShippingRoute = require('./shipping.route');

const AnalyticsRoute = require('./analytics.route');

// Dùng route con
router.use('/categories', categoryRoute); // => /api/categories

router.use('/products', productRoute); //=> api/products
router.use('/variants', productVariantsRoute); //=> api/variants (NEW)

router.use('/contact', contactRoute); //=> api/contact

router.use('/customers', customerRoute); //=> api/customers

router.use('/banner', bannerRoute); //=> api/banner

router.use('/employees', EmployeeRoute); //=> api/employees

router.use('/address', UserAddress); //=> api/address

router.use('/reviews', ReviewsRoute); //=> api/reviwes

router.use('/voucher', VoucherRoute); //=>api/vouchers

router.use('/cart', CartRoute); //=>api/cart

router.use('/order', CheckoutRoute) //=>api/order

router.use('/shipping', ShippingRoute); //=>api/shipping

router.use('/analytics', AnalyticsRoute); //=>api/analytics

module.exports = router;
