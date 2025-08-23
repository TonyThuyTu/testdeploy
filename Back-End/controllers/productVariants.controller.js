const {
  Product,
  Category,
  ProductSpec,
  ProductImg,
  Attribute,
  AttributeValue,
  ProductAttribute,
  ProductAttributeValue,
  ProductVariant,
  VariantValue,
  sequelize,
} = require('../models/index.model');

const { Op } = require('sequelize');

// Helper function to safely parse JSON
function parseJSONSafe(str, defaultValue = []) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : (str || defaultValue);
  } catch (e) {
    console.error('JSON parse error:', e);
    return defaultValue;
  }
}

// Generate unique slug
async function generateUniqueSlug(model, name, excludeId = null) {
  const baseSlug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-');

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const whereCondition = { products_slug: slug };
    if (excludeId) {
      whereCondition.id_products = { [Op.ne]: excludeId };
    }

    const existingProduct = await model.findOne({ where: whereCondition });
    if (!existingProduct) break;

    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

//=== GET PRODUCT BY ID FOR ADMIN ===
exports.getProductById = async (req, res) => {
  try {
    const productId = req.params.id;

    // 1. Get basic product info
    const product = await Product.findByPk(productId, {
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'name', 'parent_id'],
          include: [
            {
              model: Category,
              as: 'parent',
              attributes: ['category_id', 'name'],
            },
          ],
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    // 2. Get product images
    const images = await ProductImg.findAll({
      where: { 
        id_products: productId,
        id_variant: null // Only common product images
      },
      order: [['is_main', 'DESC']],
    });

    // 3. Get product specs
    const specs = await ProductSpec.findAll({
      where: { id_products: productId },
    });

    // 4. Get attributes with values
    const productAttributes = await ProductAttribute.findAll({
      where: { id_product: productId },
      include: [
        {
          model: Attribute,
          as: 'attribute',
          include: [
            {
              model: AttributeValue,
              as: 'values',
              include: [
                {
                  model: ProductAttributeValue,
                  as: 'productAttributeValues',
                  where: { id_product: productId },
                  required: true,
                },
              ],
            },
          ],
        },
      ],
    });

    // Transform attributes to frontend format
    const attributes = productAttributes.map(pa => ({
      id_attribute: pa.attribute.id_attribute,
      name: pa.attribute.name,
      type: pa.attribute.type,
      values: pa.attribute.values.map(val => ({
        id_value: val.id_value,
        value: val.value,
        value_note: val.value_note,
        status: val.status,
      })),
    }));

    // 5. Get variants (SKUs)
    const variants = await ProductVariant.findAll({
      where: { id_products: productId },
      include: [
        {
          model: VariantValue,
          as: 'variantValues',
          include: [
            {
              model: AttributeValue,
              as: 'attributeValue',
              include: [
                {
                  model: Attribute,
                  as: 'attribute',
                },
              ],
            },
          ],
        },
        {
          model: ProductImg,
          as: 'images',
          required: false,
        },
      ],
    });

    // Transform variants to frontend format
    const skus = variants.map(sku => ({
      variant_id: sku.id_variant,
      sku: sku.sku,
      price_sale: parseFloat(sku.price_sale) || 0,
      quantity: parseInt(sku.quantity) || 0,
      status: sku.status === 2 ? 1 : 0, // Frontend 2→DB 1, Frontend 1→DB 0
      option_combo: sku.variantValues.map(vv => ({
        attribute: vv.attributeValue.attribute.name,
        value: vv.attributeValue.value,
        id_value: vv.attributeValue.id_value,
        type: vv.attributeValue.attribute.type,
      })),
      images: (sku.images || []).map(img => ({
        id_product_img: img.id_product_img,
        Img_url: img.Img_url,
        is_main: img.is_main,
      })),
    }));

    // Format response
    const response = {
      product: {
        id_products: product.id_products,
        products_name: product.products_name,
        products_slug: product.products_slug,
        products_shorts: product.products_shorts,
        products_market_price: product.products_market_price,
        products_sale_price: product.products_sale_price,
        products_description: product.products_description,
        products_quantity: product.products_quantity,
        products_status: product.products_status,
        products_primary: product.products_primary,
        salePrice: parseFloat(product.products_sale_price) || 0,
        marketPrice: parseFloat(product.products_market_price) || 0,
      },
      category: product.category ? {
        category_id: product.category.category_id,
        name: product.category.name,
        parent_id: product.category.parent_id,
        parent: product.category.parent ? {
          category_id: product.category.parent.category_id,
          name: product.category.parent.name,
        } : null,
      } : null,
      images: images.map(img => ({
        id_product_img: img.id_product_img,
        id_products: img.id_products,
        id_variant: img.id_variant,
        id_value: img.id_value,
        Img_url: img.Img_url,
        is_main: img.is_main,
      })),
      specs: specs.map(spec => ({
        id_spec: spec.id_spec,
        id_products: spec.id_products,
        spec_name: spec.spec_name,
        spec_value: spec.spec_value,
      })),
      attributes,
      skus,
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Error getting product:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

//=== CREATE/UPDATE PRODUCT VARIANTS ===
exports.updateProductVariants = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const productId = req.params.id;
    const { attributes, variants } = req.body;

    console.log('🔄 Updating product variants:', {
      productId,
      attributesRaw: attributes,
      variantsRaw: variants
    });

    // Check if product exists
    const existingProduct = await Product.findByPk(productId, { transaction: t });
    if (!existingProduct) {
      await t.rollback();
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    // Parse data
    const attributesParsed = parseJSONSafe(attributes, []);
    const variantsParsed = parseJSONSafe(variants, []);

    console.log('📊 Parsed data:', {
      attributesCount: attributesParsed.length,
      variantsCount: variantsParsed.length,
      attributesData: JSON.stringify(attributesParsed, null, 2),
      variantsData: JSON.stringify(variantsParsed, null, 2)
    });

    // 1. Clear existing attributes and variants for this product
    console.log('🗑️ Clearing existing data...');
    
    // First get existing variants to delete their values
    const existingVariants = await ProductVariant.findAll({
      where: { id_products: productId },
      transaction: t
    });

    const existingVariantIds = existingVariants.map(v => v.id_variant);

    // Delete in correct order to avoid foreign key issues
    if (existingVariantIds.length > 0) {
      // Delete variant values
      await VariantValue.destroy({
        where: { id_variant: { [Op.in]: existingVariantIds } },
        transaction: t
      });

      // Delete variant images  
      await ProductImg.destroy({
        where: { id_variant: { [Op.in]: existingVariantIds } },
        transaction: t
      });

      // Delete variants
      await ProductVariant.destroy({
        where: { id_variant: { [Op.in]: existingVariantIds } },
        transaction: t
      });
    }

    // Delete product attribute values and links
    await ProductAttributeValue.destroy({
      where: { id_product: productId },
      transaction: t
    });

    await ProductAttribute.destroy({
      where: { id_product: productId },
      transaction: t
    });

    // 2. Create new attributes
    console.log('✨ Creating new attributes...');
    const attributeValueMap = {};

    for (const attr of attributesParsed) {
      if (!attr.name?.trim()) continue;

      // Create or find attribute
      const [attribute] = await Attribute.findOrCreate({
        where: { name: attr.name.trim() },
        defaults: {
          name: attr.name.trim(),
          type: attr.type || 1,
        },
        transaction: t,
      });

      // Link attribute to product
      await ProductAttribute.create({
        id_product: productId,
        id_attribute: attribute.id_attribute,
      }, { transaction: t });

      // Create attribute values
      for (const val of attr.values || []) {
        if (!val.label?.trim()) continue;

        const [attributeValue] = await AttributeValue.findOrCreate({
          where: {
            id_attribute: attribute.id_attribute,
            value: val.value || val.label,
          },
          defaults: {
            id_attribute: attribute.id_attribute,
            value: val.value || val.label,
            value_note: val.value_note || null,
            status: val.status || 1,
          },
          transaction: t,
        });

        // Link attribute value to product
        await ProductAttributeValue.create({
          id_product: productId,
          id_attribute: attribute.id_attribute,
          id_value: attributeValue.id_value,
        }, { transaction: t });

        // Store for variant creation
        const key = `${attr.name.trim()}:${val.value || val.label}`;
        attributeValueMap[key] = attributeValue.id_value;
      }
    }

    // 3. Create variants
    console.log('🔧 Creating variants...');
    const createdVariants = []; // Store created variants with their combinations
    
    for (const variant of variantsParsed) {
      if (!variant.combination || !Array.isArray(variant.combination)) continue;

      // Create product variant
      const productVariant = await ProductVariant.create({
        id_products: productId,
        sku: variant.sku || '',
        price_sale: parseFloat(variant.price_sale) || 0,
        quantity: parseInt(variant.quantity) || 0,
        status: variant.status || 1,
      }, { transaction: t });

      // Store for image mapping
      createdVariants.push({
        id_variant: productVariant.id_variant,
        combination: variant.combination,
        originalIndex: variantsParsed.indexOf(variant)
      });

      // Create variant values (links to attribute values)
      for (const combo of variant.combination) {
        const key = `${combo.attributeName}:${combo.value}`;
        const attributeValueId = attributeValueMap[key];
        
        if (attributeValueId) {
          await VariantValue.create({
            id_variant: productVariant.id_variant,
            id_value: attributeValueId,
          }, { transaction: t });
        }
      }

      // Handle variant images
      const variantImages = variant.images || [];
      for (let i = 0; i < variantImages.length; i++) {
        const img = variantImages[i];
        if (img.url) { // Existing image
          await ProductImg.create({
            id_products: productId,
            id_variant: productVariant.id_variant,
            Img_url: img.url,
            is_main: img.isMain || false,
          }, { transaction: t });
        }
      }
    }

    // Handle new variant images from files
    if (req.files && req.files.variantImages) {
      const variantImageData = parseJSONSafe(req.body.variantImageData, []);
      const variantImageFiles = Array.isArray(req.files.variantImages) 
        ? req.files.variantImages 
        : [req.files.variantImages];

      console.log('📸 Processing variant images:', {
        filesCount: variantImageFiles.length,
        imageDataCount: variantImageData.length,
        createdVariantsCount: createdVariants.length
      });

      for (let i = 0; i < variantImageFiles.length; i++) {
        const file = variantImageFiles[i];
        const imageData = variantImageData[i];
        
        if (imageData && imageData.variantIndex !== undefined) {
          // Find the created variant by matching original index
          const matchedVariant = createdVariants.find(cv => cv.originalIndex === imageData.variantIndex);
          
          if (matchedVariant) {
            console.log(`📸 Adding image ${file.filename} to variant ${matchedVariant.id_variant} (index ${imageData.variantIndex})`);
            
            await ProductImg.create({
              id_products: productId,
              id_variant: matchedVariant.id_variant,
              Img_url: `/uploads/${file.filename}`,
              is_main: imageData.isMain || false,
            }, { transaction: t });
          } else {
            console.log(`⚠️ No matching variant found for image index ${imageData.variantIndex}`);
          }
        }
      }
    }

    await t.commit();
    console.log('✅ Product variants updated successfully');
    
    res.json({ 
      message: 'Cập nhật biến thể sản phẩm thành công!',
      productId: productId
    });

  } catch (error) {
    await t.rollback();
    console.error('❌ Error updating product variants:', error);
    res.status(500).json({ 
      message: 'Lỗi cập nhật biến thể sản phẩm', 
      error: error.message 
    });
  }
};

//=== UPDATE PRODUCT BASIC INFO ===
exports.updateProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const productId = req.params.id;
    const {
      products_name,
      products_shorts,
      products_description,
      products_sale_price,
      products_quantity,
      category_id,
      specs,
      existingImages,
      products_status,
    } = req.body;

    console.log('🔄 Updating product:', {
      productId,
      products_name,
      category_id,
      specsCount: parseJSONSafe(specs, []).length
    });

    // Check if product exists
    const existingProduct = await Product.findByPk(productId, { transaction: t });
    if (!existingProduct) {
      await t.rollback();
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    // Generate slug if name changed
    let products_slug = existingProduct.products_slug;
    if (products_name && products_name !== existingProduct.products_name) {
      products_slug = await generateUniqueSlug(Product, products_name, productId);
    }

    // Update product basic info
    await Product.update({
      products_name: products_name || existingProduct.products_name,
      products_slug,
      products_shorts: products_shorts || existingProduct.products_shorts,
      products_description: products_description || existingProduct.products_description,
      products_sale_price: products_sale_price || existingProduct.products_sale_price,
      products_quantity: products_quantity || existingProduct.products_quantity,
      category_id: category_id || existingProduct.category_id,
      products_status: products_status || existingProduct.products_status,
    }, { 
      where: { id_products: productId },
      transaction: t 
    });

    console.log('✅ Product basic info updated');

    // Update specs - remove old, add new
    const specsParsed = parseJSONSafe(specs, []);
    await ProductSpec.destroy({
      where: { id_products: productId },
      transaction: t
    });

    if (specsParsed.length > 0) {
      const specsToCreate = specsParsed
        .filter(spec => spec.name?.trim() && spec.value?.trim())
        .map(spec => ({
          id_products: productId,
          spec_name: spec.name.trim(),
          spec_value: spec.value.trim(),
        }));

      if (specsToCreate.length > 0) {
        await ProductSpec.bulkCreate(specsToCreate, { transaction: t });
        console.log('✅ Specs updated:', specsToCreate.length);
      }
    }

    // Handle existing images
    const existingImagesParsed = parseJSONSafe(existingImages, []);

    // Chỉ xóa và tạo lại ảnh nếu có danh sách ảnh được gửi lên
    if (existingImagesParsed.length > 0) {
      // Remove all old common images (not variant images)
      await ProductImg.destroy({
        where: { 
          id_products: productId,
          id_variant: null,
        },
        transaction: t
      });

      // Tạo lại các ảnh từ danh sách
      for (const img of existingImagesParsed) {
        if (img.Img_url) {
          await ProductImg.create({
            id_products: productId,
            id_variant: null,
            id_value: null,
            Img_url: img.Img_url,
            is_main: img.is_main || false,
          }, { transaction: t });
        }
      }
    }

    // Handle new images from file upload
    const commonImages = req.files?.commonImages || [];

    // Thêm ảnh mới nếu có
    for (const file of commonImages) {
      await ProductImg.create({
        id_products: productId,
        id_variant: null,
        id_value: null,
        Img_url: process.env.BACKEND_URL + `/uploads/${file.filename}`,
        is_main: false, // Không đặt mặc định là ảnh chính
      }, { transaction: t });
    }

    await t.commit();
    console.log('✅ Product updated successfully');

    res.json({
      success: true,
      message: 'Cập nhật sản phẩm thành công!',
      productId: productId
    });

  } catch (error) {
    await t.rollback();
    console.error('❌ Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi cập nhật sản phẩm',
      error: error.message
    });
  }
};

module.exports = {
  getProductById: exports.getProductById,
  updateProductVariants: exports.updateProductVariants,
  updateProduct: exports.updateProduct,
};
