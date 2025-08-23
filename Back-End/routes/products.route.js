const express = require('express');
const router = express.Router();
const uploadProduct = require('../helper/uploadProduct'); // dùng multer cho nhiều file
const productController = require('../controllers/product.controller');
const productNewController = require('../controllers/productNew.controller'); // NEW CONTROLLER
const validateJsonMiddleware = require('../middlewares/validateJson');
const multerErrorHandler = require('../middlewares/multerErrorHandler');

//get id products for admin
router.get('/admin/:id', productController.getProductsByIdforAdmin);

//test endpoint
router.get('/test-admin/:id', async (req, res) => {
  try {
    const { Product, ProductAttribute, ProductVariant, Attribute, AttributeValue } = require('../models/index.model');
    const id = req.params.id;
    
    // Test basic product query
    const product = await Product.findByPk(id);
    if (!product) {
      return res.json({ error: "Product not found" });
    }

    // Test ProductAttribute relation
    const productAttrs = await ProductAttribute.findAll({
      where: { id_product: id }
    });

    // Test ProductVariant relation  
    const variants = await ProductVariant.findAll({
      where: { id_products: id }
    });

    // Test Attributes
    const attributes = await Attribute.findAll();

    // Test AttributeValues
    const attributeValues = await AttributeValue.findAll();

    res.json({ 
      message: "Debug data", 
      id: req.params.id,
      product: {
        id: product.id_products,
        name: product.products_name
      },
      productAttrsCount: productAttrs.length,
      variantsCount: variants.length,
      totalAttributesCount: attributes.length,
      totalAttributeValuesCount: attributeValues.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      error: error.message,
      stack: error.stack
    });
  }
});

//search product
router.get('/search', productController.searchProducts);

//add product (old structure)
router.post(
  '/',
  uploadProduct.fields([
    { name: 'commonImages', maxCount: 30 },
    { name: 'optionImages', maxCount: 30 }
  ]),
  multerErrorHandler,
  validateJsonMiddleware(['specs', 'attributes', 'variants']),
  productController.createProducts
);

//add product (new structure)
router.post(
  '/new',
  uploadProduct.fields([
    { name: 'commonImages', maxCount: 30 },
    { name: 'variantImages', maxCount: 100 }
  ]),
  multerErrorHandler,
  validateJsonMiddleware(['specs', 'attributes', 'variants']),
  productNewController.createProductNew
);

router.put(
  '/new/:id',
  uploadProduct.fields([
    { name: 'commonImages', maxCount: 30 },
    { name: 'variantImages', maxCount: 100 }
  ]),
  multerErrorHandler,
  validateJsonMiddleware(['specs', 'attributes', 'variants']),
  productNewController.updateProductNew
);


router.put(
  '/:id/variants',
  uploadProduct.fields([
    { name: 'optionImages', maxCount: 100 },
    { name: 'variantImages', maxCount: 100 }
  ]),
  multerErrorHandler,
  validateJsonMiddleware(['attributes', 'variants']),
  productNewController.updateProductVariants
);
  

router.put(
  '/:id',
  uploadProduct.fields([
    { name: 'images', maxCount: 10 },
    { name: 'optionFiles', maxCount: 30}
  ]),
  multerErrorHandler,
  productController.updateProduct
);

router.get('/id/:id', productController.getProductsByIdforAdmin);

router.get('/:slug', productController.getProductsById);

router.get('/', productController.getAllProducts);

router.patch('/:id/toggle-primary', productController.togglePrimary);

router.patch('/:id/toggle-featured', productController.toggleFeatured);

router.delete('/:id', productController.deleteProductHard);

router.get('/same-products/:id/same', productController.getSameProducts);

module.exports = router;
