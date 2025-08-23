const db = require('../models/index.model');
const path = require('path');
const { Op } = require("sequelize");
const fs = require('fs');
const sequelize = db.sequelize;

const { Product, ProductImg, ProductSpec, Attribute, AttributeValue, ProductAttribute, ProductVariant, VariantValue, ProductAttributeValue } = db;

// Helper function to parse JSON safely
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
    const whereClause = { products_slug: slug };
    if (excludeId) {
      whereClause.id_products = { [Op.ne]: excludeId };
    }

    const existing = await model.findOne({ where: whereClause });
    if (!existing) break;

    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

// Generate SKU from combination
function generateSKU(productName, combination) {
  const productCode = productName.substring(0, 3).toUpperCase();
  const variantCode = combination.map(item => 
    (item.value_note || item.value).substring(0, 2).toUpperCase()
  ).join('');
  
  return `${productCode}-${variantCode}-${Date.now().toString().slice(-4)}`;
}

//=== NEW CREATE PRODUCT WITH CORRECT STRUCTURE ===
exports.createProductNew = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      products_name,
      category_id,
      products_slug,
      products_sale_price,
      products_description,
      products_shorts,
      products_quantity,
      specs,
      attributes,
      variants,
      commonImageIsMain,
      variantImageData,
    } = req.body;

    console.log('📝 Creating product with new structure:', {
      products_name,
      attributesCount: parseJSONSafe(attributes, []).length,
      variantsCount: parseJSONSafe(variants, []).length
    });

    // Validate input
    if (!products_name?.trim()) {
      await t.rollback();
      return res.status(400).json({ message: "Tên sản phẩm là bắt buộc" });
    }
    
    if (!category_id || isNaN(+category_id)) {
      await t.rollback();
      return res.status(400).json({ message: "Danh mục không hợp lệ" });
    }

    const salePrice = parseFloat(products_sale_price) || 0;
    
    if (salePrice < 0) {
      await t.rollback();
      return res.status(400).json({ message: "Giá không được âm" });
    }

    // Parse data
    const specsParsed = parseJSONSafe(specs, []);
    const attributesParsed = parseJSONSafe(attributes, []);
    const variantsParsed = parseJSONSafe(variants, []);
    const variantImageDataParsed = parseJSONSafe(variantImageData, []);

    console.log('📊 Parsed data:', {
      specs: specsParsed.length,
      attributes: attributesParsed.length,
      variants: variantsParsed.length
    });

    // Generate unique slug
    const slug = products_slug?.trim() || await generateUniqueSlug(Product, products_name);

    // Create product
    const newProduct = await Product.create({
      products_name: products_name.trim(),
      products_slug: slug,
      category_id: +category_id,
      products_sale_price: salePrice,
      products_description: products_description || '',
      products_shorts: products_shorts || '',
      products_quantity: products_quantity || 0,
      products_status: 1,
      products_primary: 0,
    }, { transaction: t });

    console.log('✅ Product created:', newProduct.id_products);

    // Create specs
    if (specsParsed.length > 0) {
      const specsToCreate = specsParsed
        .filter(spec => spec.name?.trim() && spec.value?.trim())
        .map(spec => ({
          id_products: newProduct.id_products,
          spec_name: spec.name.trim(),
          spec_value: spec.value.trim(),
        }));

      if (specsToCreate.length > 0) {
        await ProductSpec.bulkCreate(specsToCreate, { transaction: t });
        console.log('✅ Specs created:', specsToCreate.length);
      }
    }

    // Process attributes (without price, quantity, images)
    const attributeValueMap = {};
    
    if (attributesParsed.length > 0) {
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
        await ProductAttribute.findOrCreate({
          where: {
            id_product: newProduct.id_products,
            id_attribute: attribute.id_attribute,
          },
          transaction: t,
        });

        // Create attribute values
        if (attr.values && attr.values.length > 0) {
          for (const val of attr.values) {
            if (!val.value?.trim()) continue;

            const [attributeValue] = await AttributeValue.findOrCreate({
              where: {
                id_attribute: attribute.id_attribute,
                value: val.value.trim(),
              },
              defaults: {
                id_attribute: attribute.id_attribute,
                value: val.value.trim(),
                value_note: val.value_note || null,
                extra_price: parseFloat(val.extra_price) || 0,
                status: val.status || 1,
              },
              transaction: t,
            });

            // Link to product
            await ProductAttributeValue.findOrCreate({
              where: {
                id_product: newProduct.id_products,
                id_value: attributeValue.id_value,
              },
              transaction: t,
            });

            // Store for variant creation
            const key = `${attr.name.trim()}-${val.value.trim()}`;
            attributeValueMap[key] = attributeValue.id_value;
          }
        }
      }
      console.log('✅ Attributes processed:', Object.keys(attributeValueMap).length);
    }

    // Process common images
    const commonImages = req.files?.commonImages || [];
    const commonFlags = Array.isArray(commonImageIsMain) ? commonImageIsMain : [commonImageIsMain];
    
    if (commonImages.length > 0) {
      const commonImageRecords = commonImages.map((file, i) => ({
        id_products: newProduct.id_products,
        id_variant: null,
        id_value: null,
        Img_url: process.env.BACKEND_URL + `/uploads/${file.filename}`,
        is_main: commonFlags[i] === 'true',
      }));

      // Ensure only one main image
      let hasMain = false;
      const processedImages = commonImageRecords.map(img => {
        if (img.is_main && !hasMain) {
          hasMain = true;
          return img;
        }
        return { ...img, is_main: false };
      });

      await ProductImg.bulkCreate(processedImages, { transaction: t });
      console.log('✅ Common images created:', processedImages.length);
    }

    // Process variants (SKUs) and store for image processing
    const createdVariants = [];

    if (variantsParsed.length > 0) {
      for (let i = 0; i < variantsParsed.length; i++) {
        const variant = variantsParsed[i];
        if (!variant.combination || variant.combination.length === 0) continue;

        // Generate SKU if not provided
        const sku = variant.sku?.trim() || generateSKU(products_name, variant.combination);

        // Check SKU uniqueness
        const existingSku = await ProductVariant.findOne({
          where: { sku },
          transaction: t,
        });

        if (existingSku) {
          await t.rollback();
          return res.status(400).json({
            message: `SKU "${sku}" đã tồn tại`
          });
        }

        // Create variant
        const newVariant = await ProductVariant.create({
          id_products: newProduct.id_products,
          sku,
          price_sale: parseFloat(variant.price_sale) || 0,
          quantity: parseInt(variant.quantity) || 0,
          status: variant.status || 1,
        }, { transaction: t });

        // Link variant to attribute values
        for (const combo of variant.combination) {
          const key = `${combo.attributeName}-${combo.value}`;
          const id_value = attributeValueMap[key];

          if (id_value) {
            await VariantValue.create({
              id_variant: newVariant.id_variant,
              id_value,
            }, { transaction: t });
          }
        }

        // Store variant info for image processing
        createdVariants.push({
          index: i,
          id_variant: newVariant.id_variant,
          sku,
          combination: variant.combination
        });

        console.log('✅ Variant created:', sku);
      }
    }

    // Process variant images
    const variantImages = req.files?.variantImages || [];
    if (variantImages.length > 0 && variantImageDataParsed.length > 0) {
      for (let i = 0; i < variantImages.length; i++) {
        const file = variantImages[i];
        const imageData = variantImageDataParsed[i];

        if (!imageData) continue;

        // Find the corresponding variant
        const variant = createdVariants.find(v => v.index === imageData.variantIndex);
        if (!variant) continue;

        // Create image record
        await ProductImg.create({
          id_products: newProduct.id_products,
          id_variant: variant.id_variant,
          id_value: null,
          Img_url: `/uploads/${file.filename}`,
          is_main: imageData.isMain || false,
        }, { transaction: t });

        console.log('✅ Variant image created for SKU:', variant.sku);
      }
    }

    await t.commit();
    
    res.status(201).json({
      message: "Sản phẩm đã được tạo thành công",
      product: {
        id_products: newProduct.id_products,
        products_name: newProduct.products_name,
        products_slug: newProduct.products_slug,
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('❌ Error creating product:', error);
    res.status(500).json({
      message: "Lỗi khi tạo sản phẩm",
      error: error.message
    });
  }
};

//=== NEW UPDATE PRODUCT WITH CORRECT STRUCTURE ===
exports.updateProductNew = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const productId = req.params.id;
    const {
      products_name,
      category_id,
      products_slug,
      products_market_price,
      products_sale_price,
      products_description,
      products_shorts,
      products_quantity,
      products_status,
      specs,
      attributes,
      variants,
      existingCommonImages,
      existingVariantImages,
      variantImageData,
    } = req.body;

    console.log('🔄 Updating product with NEW structure:', {
      productId,
      products_name,
      attributesCount: parseJSONSafe(attributes, []).length,
      variantsCount: parseJSONSafe(variants, []).length
    });

    // Find existing product
    const existingProduct = await Product.findByPk(productId, { transaction: t });
    if (!existingProduct) {
      await t.rollback();
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    // Validate input
    if (!products_name?.trim()) {
      await t.rollback();
      return res.status(400).json({ message: "Tên sản phẩm là bắt buộc" });
    }

    const marketPrice = parseFloat(products_market_price) || 0;
    const salePrice = parseFloat(products_sale_price) || 0;

    if (marketPrice < 0 || salePrice < 0) {
      await t.rollback();
      return res.status(400).json({ message: "Giá không được âm" });
    }

    if (salePrice < marketPrice) {
      await t.rollback();
      return res.status(400).json({ message: "Giá bán không được nhỏ hơn giá nhập" });
    }

    // Parse data
    const specsParsed = parseJSONSafe(specs, []);
    const attributesParsed = parseJSONSafe(attributes, []);
    const variantsParsed = parseJSONSafe(variants, []);
    const existingCommonImagesParsed = parseJSONSafe(existingCommonImages, []);
    const existingVariantImagesParsed = parseJSONSafe(existingVariantImages, []);
    const variantImageDataParsed = parseJSONSafe(variantImageData, []);

    // Generate unique slug if changed
    let slug = products_slug?.trim();
    if (!slug || slug !== existingProduct.products_slug) {
      slug = await generateUniqueSlug(Product, products_name, productId);
    }

    // Update product
    await existingProduct.update({
      products_name: products_name.trim(),
      products_slug: slug,
      category_id: +category_id,
      products_market_price: marketPrice,
      products_sale_price: salePrice,
      products_description: products_description || '',
      products_shorts: products_shorts || '',
      products_quantity: products_quantity || 0,
      products_status: products_status || 1,
    }, { transaction: t });

    console.log('✅ Product updated:', productId);

    // Update specs - remove old, add new
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

    // TODO: Update attributes and variants
    // This is complex and would need careful handling of existing data
    // For now, we'll just log that this needs implementation
    console.log('⚠️ Attributes and variants update not yet implemented');
    console.log('📊 Data to process:', {
      attributes: attributesParsed.length,
      variants: variantsParsed.length
    });

    await t.commit();

    res.status(200).json({
      message: "Sản phẩm đã được cập nhật thành công",
      product: {
        id_products: productId,
        products_name: existingProduct.products_name,
        products_slug: existingProduct.products_slug,
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('❌ Error updating product:', error);
    res.status(500).json({
      message: "Lỗi khi cập nhật sản phẩm",
      error: error.message
    });
  }
};

//=== UPDATE PRODUCT VARIANTS ONLY ===
exports.updateProductVariants = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const productId = req.params.id;
    const { attributes, variants } = req.body;

    console.log('🔄 Updating product variants:', {
      productId,
      attributesCount: parseJSONSafe(attributes, []).length,
      variantsCount: parseJSONSafe(variants, []).length
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
      attributes: attributesParsed.length,
      variants: variantsParsed.length
    });

    console.log('🔍 Raw attributes data:', attributes);
    console.log('🔍 Raw variants data:', variants);
    console.log('🔍 Parsed attributes:', JSON.stringify(attributesParsed, null, 2));
    console.log('🔍 Parsed variants:', JSON.stringify(variantsParsed, null, 2));

    // Smart update variants instead of delete all and recreate
    console.log('🔄 Smart updating variants...');
    
    // Get existing variants
    const existingVariants = await ProductVariant.findAll({
      where: { id_products: productId },
      include: [
        {
          model: VariantValue,
          as: 'variantValues',
          include: [{
            model: AttributeValue,
            as: 'attributeValue',
            include: [{
              model: Attribute,
              as: 'attribute'
            }]
          }]
        }
      ],
      transaction: t
    });

    // Create signature for comparison
    const createVariantSignature = (combination) => {
      return combination.map(c => `${c.attributeName}:${c.value}`).sort().join('|');
    };

    const existingSignatures = existingVariants.map(v => ({
      id_variant: v.id_variant,
      signature: createVariantSignature(v.variantValues.map(vv => ({
        attributeName: vv.attributeValue.attribute.name,
        value: vv.attributeValue.value
      })))
    }));

    const newSignatures = variantsParsed.map(v => ({
      variant: v,
      signature: createVariantSignature(v.combination)
    }));

    // Find variants to delete (exist in DB but not in new data)
    const variantsToDelete = existingSignatures.filter(
      existing => !newSignatures.find(newSig => newSig.signature === existing.signature)
    );

    // Find variants to create (exist in new data but not in DB)
    const variantsToCreate = newSignatures.filter(
      newSig => !existingSignatures.find(existing => existing.signature === newSig.signature)
    );

    // Find variants to update (exist in both)
    const variantsToUpdate = newSignatures.filter(
      newSig => existingSignatures.find(existing => existing.signature === newSig.signature)
    ).map(newSig => ({
      ...newSig,
      id_variant: existingSignatures.find(existing => existing.signature === newSig.signature).id_variant
    }));

    console.log(`📊 Variants analysis:`, {
      toDelete: variantsToDelete.length,
      toCreate: variantsToCreate.length, 
      toUpdate: variantsToUpdate.length
    });

    // Delete variants that are no longer needed
    if (variantsToDelete.length > 0) {
      const idsToDelete = variantsToDelete.map(v => v.id_variant);
      
      // Delete variant images first
      await ProductImg.destroy({
        where: { id_variant: { [Op.in]: idsToDelete } },
        transaction: t
      });

      // Delete variant values
      await VariantValue.destroy({
        where: { id_variant: { [Op.in]: idsToDelete } },
        transaction: t
      });

      // Delete variants
      await ProductVariant.destroy({
        where: { id_variant: { [Op.in]: idsToDelete } },
        transaction: t
      });
    }

    // Update existing variants (preserve their images)
    for (const variantInfo of variantsToUpdate) {
      await ProductVariant.update({
        price_sale: parseFloat(variantInfo.variant.price_sale) || 0,
        quantity: parseInt(variantInfo.variant.quantity) || 0,
        status: variantInfo.variant.status || 1,
      }, {
        where: { id_variant: variantInfo.id_variant },
        transaction: t
      });
    }

    // Clear attributes (we'll recreate these)
    await ProductAttributeValue.destroy({
      where: { id_product: productId },
      transaction: t
    });

    await ProductAttribute.destroy({
      where: { id_product: productId },
      transaction: t
    });

    // Clear option images only
    await ProductImg.destroy({
      where: { 
        id_products: productId,
        id_value: { [Op.ne]: null }
      },
      transaction: t
    });

    console.log('✅ Cleared existing variants and attributes');

    // Process new attributes
    const attributeValueMap = {};
    
    if (attributesParsed.length > 0) {
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
        await ProductAttribute.findOrCreate({
          where: {
            id_product: productId,
            id_attribute: attribute.id_attribute,
          },
          transaction: t,
        });

        // Create attribute values
        if (attr.values && attr.values.length > 0) {
          for (const val of attr.values) {
            if (!val.value?.trim()) continue;

            const [attributeValue] = await AttributeValue.findOrCreate({
              where: {
                id_attribute: attribute.id_attribute,
                value: val.value.trim(),
              },
              defaults: {
                id_attribute: attribute.id_attribute,
                value: val.value.trim(),
                value_note: val.value_note || null,
                extra_price: parseFloat(val.extra_price) || 0,
                status: val.status || 1,
              },
              transaction: t,
            });

            // Link to product
            await ProductAttributeValue.findOrCreate({
              where: {
                id_product: productId,
                id_value: attributeValue.id_value,
              },
              transaction: t,
            });

            // Store for variant creation
            const key = `${attr.name.trim()}-${val.value.trim()}`;
            attributeValueMap[key] = attributeValue.id_value;
          }
        }
      }
      console.log('✅ Attributes processed:', Object.keys(attributeValueMap).length);
    }

    // Process option images
    const optionImages = req.files?.optionImages || [];
    const optionImageIsMain = Array.isArray(req.body.optionImageIsMain) 
      ? req.body.optionImageIsMain 
      : [req.body.optionImageIsMain];
    const optionImageValues = Array.isArray(req.body.optionImageValues) 
      ? req.body.optionImageValues 
      : [req.body.optionImageValues];

    if (optionImages.length > 0) {
      for (let i = 0; i < optionImages.length; i++) {
        const file = optionImages[i];
        const isMain = optionImageIsMain[i] === 'true';
        const valueLabel = optionImageValues[i];

        // Find the id_value from the label
        let id_value = null;
        for (const key in attributeValueMap) {
          if (key.includes(valueLabel)) {
            id_value = attributeValueMap[key];
            break;
          }
        }

        if (id_value) {
          await ProductImg.create({
            id_products: productId,
            id_variant: null,
            id_value,
            Img_url: `/uploads/${file.filename}`,
            is_main: isMain,
          }, { transaction: t });
        }
      }
      console.log('✅ Option images created:', optionImages.length);
    }

    // Create only new variants
    const createdVariants = [];
    
    if (variantsToCreate.length > 0) {
      for (let i = 0; i < variantsToCreate.length; i++) {
        const variantInfo = variantsToCreate[i];
        const variant = variantInfo.variant;
        
        if (!variant.combination || variant.combination.length === 0) continue;

        // Generate SKU if not provided
        const sku = variant.sku?.trim() || generateSKU(existingProduct.products_name, variant.combination);

        // Check SKU uniqueness (exclude current product's variants)
        const existingSku = await ProductVariant.findOne({
          where: { 
            sku,
            id_products: { [Op.ne]: productId }
          },
          transaction: t,
        });

        if (existingSku) {
          await t.rollback();
          return res.status(400).json({
            message: `SKU "${sku}" đã tồn tại trong sản phẩm khác`
          });
        }

        // Create variant
        const newVariant = await ProductVariant.create({
          id_products: productId,
          sku,
          price_sale: parseFloat(variant.price_sale) || 0,
          quantity: parseInt(variant.quantity) || 0,
          status: variant.status || 1,
        }, { transaction: t });

        // Link variant to attribute values
        for (const combo of variant.combination) {
          const key = `${combo.attributeName}-${combo.value}`;
          const id_value = attributeValueMap[key];

          if (id_value) {
            await VariantValue.create({
              id_variant: newVariant.id_variant,
              id_value,
            }, { transaction: t });
          }
        }

        // Store variant info for image processing
        createdVariants.push({
          index: i,
          id_variant: newVariant.id_variant,
          sku,
          combination: variant.combination
        });

        console.log('✅ New variant created:', sku);
      }
    }

    // Process variant images (SKU images)
    const variantImages = req.files?.variantImages || [];
    const variantImageData = req.body.variantImageData ? parseJSONSafe(req.body.variantImageData, []) : [];
    
    if (variantImages.length > 0 && variantImageData.length > 0) {
      for (let i = 0; i < variantImages.length; i++) {
        const file = variantImages[i];
        const imageData = variantImageData[i];

        if (!imageData) continue;

        // Find the corresponding variant
        const variant = createdVariants.find(v => v.index === imageData.variantIndex);
        if (!variant) continue;

        // Create image record
        await ProductImg.create({
          id_products: productId,
          id_variant: variant.id_variant,
          id_value: null,
          Img_url: `/uploads/${file.filename}`,
          is_main: imageData.isMain || false,
        }, { transaction: t });

        console.log('✅ Variant image created for SKU:', variant.sku);
      }
    }

    await t.commit();

    res.status(200).json({
      message: "Cập nhật biến thể sản phẩm thành công",
      product: {
        id_products: productId,
        products_name: existingProduct.products_name,
        attributesCount: attributesParsed.length,
        variantsCount: variantsParsed.length
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('❌ Error updating product variants:', error);
    res.status(500).json({
      message: "Lỗi khi cập nhật biến thể sản phẩm",
      error: error.message
    });
  }
};
