const express = require('express');
const router = express.Router();
const uploadProduct = require('../helper/uploadProduct');
const productVariantsController = require('../controllers/productVariants.controller');
const validateJsonMiddleware = require('../middlewares/validateJson');
const multerErrorHandler = require('../middlewares/multerErrorHandler');

// Get product by ID for variants management
router.get('/admin/:id', productVariantsController.getProductById);

// Update product basic info
router.put(
  '/:id',
  uploadProduct.fields([
    { name: 'commonImages', maxCount: 30 }
  ]),
  multerErrorHandler,
  validateJsonMiddleware(['specs', 'existingImages']),
  productVariantsController.updateProduct
);

// Update product variants only
router.put(
  '/:id/variants',
  uploadProduct.fields([
    { name: 'optionImages', maxCount: 100 },
    { name: 'variantImages', maxCount: 100 }
  ]),
  multerErrorHandler,
  validateJsonMiddleware(['attributes', 'variants']),
  productVariantsController.updateProductVariants
);

module.exports = router;
