import { useEffect } from "react";
import { Table, Form, Button } from "react-bootstrap";
import API_CONFIG from "@/config/api";

function isHexColor(value) {
  return /^#([0-9A-F]{3}){1,2}$/i.test(value);
}

function getOptionCombinations(optionValues) {
  console.log('🔍 getOptionCombinations input:', optionValues);
  
  if (optionValues.length === 0) return [];
  
  // Trường hợp đặc biệt: chỉ có 1 thuộc tính
  if (optionValues.length === 1) {
    const result = optionValues[0].map(value => [value]);
    console.log('🔍 Single option result:', result);
    return result;
  }
  
  // Trường hợp có nhiều thuộc tính
  const result = optionValues.reduce((acc, curr) => {
    if (acc.length === 0) {
      return curr.map(c => [c]);
    }
    const combinations = [];
    acc.forEach((a) => {
      curr.forEach((c) => {
        combinations.push([...a, c]);
      });
    });
    return combinations;
  }, []);
  
  console.log('🔍 Multiple options result:', result);
  return result;
}

function isSameSkuList(listA, listB) {
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i++) {
    if (JSON.stringify(listA[i]) !== JSON.stringify(listB[i])) {
      return false;
    }
  }
  return true;
}

// So sánh signature của variants (combination attributes)
const createVariantSignature = (combination) => {
  return combination.map(c => `${c.attributeName}:${c.value}`).sort().join('|');
};

// Phân loại:
// - variantsToDelete: Có trong DB nhưng không có trong request mới
// - variantsToCreate: Có trong request mới nhưng chưa có trong DB  
// - variantsToUpdate: Có trong cả DB và request mới

export default function SkuManager({ options = [], skuList, setSkuList }) {
  useEffect(() => {
    console.log('🔍 SkuManager useEffect triggered, options:', options);
    
    if (options.length >= 1 && options.some(opt => opt.values && opt.values.length > 0)) {
      console.log('🔍 Valid options found, processing...');
      
      const valuesList = options
        .filter(opt => opt.values && opt.values.length > 0) // Chỉ lấy những thuộc tính có giá trị
        .map(opt =>
          opt.values.map(v => ({
            // id_value: v.id_value,
            label: v.label,
            value: v.value || v.label,
            optionName: opt.name,
          }))
        );

      console.log('🔍 valuesList:', valuesList);

      const combinations = getOptionCombinations(valuesList);
      console.log('🔍 combinations:', combinations);

      const newSkus = combinations.map(combo => {
        const existingSku = skuList.find(sku => {
          if (!sku.combo) return false;
          if (sku.combo.length !== combo.length) return false;
          return sku.combo.every((item, idx) => item.value === combo[idx].value);
        });

        return {
          combo,
          price_sale: existingSku ? existingSku.price_sale : 0,
          quantity: existingSku ? existingSku.quantity : 0,
          status: existingSku ? existingSku.status : 2,
          main_image_index: existingSku?.main_image_index ?? null,
          images: existingSku?.images || [],
        };
      });

      console.log('🔍 newSkus generated:', newSkus);

      // Luôn cập nhật skuList nếu có combinations
      if (combinations.length > 0) {
        console.log('🔍 Updating skuList with:', newSkus);
        setSkuList(newSkus);
      }
    } else {
      console.log('🔍 No valid options, clearing skuList');
      if (skuList.length !== 0) {
        setSkuList([]);
      }
    }
  }, [options]); // Chỉ depend vào options

  const handleChange = (i, field, value) => {
    const updated = [...skuList];
    updated[i][field] = value;
    setSkuList(updated);
  };

  const handleSkuImageUpload = (e, skuIndex) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return; // No files selected
    
    const images = files.map(file => ({
      file,
      url: URL.createObjectURL(file),
      isMain: false,
    }));
    
    const updated = [...skuList];
    if (!updated[skuIndex].images) {
      updated[skuIndex].images = [];
    }
    
    // Replace old images with new ones (don't append)
    // But keep existing images that are not files (already uploaded ones)
    const existingImages = updated[skuIndex].images.filter(img => !img.file);
    updated[skuIndex].images = [...existingImages, ...images];
    
    // If it's the first image, make it main
    if (updated[skuIndex].images.length === images.length && images.length > 0) {
      updated[skuIndex].images[existingImages.length].isMain = true;
    }
    
    setSkuList(updated);
  };

  const handleSetMainImage = (skuIndex, imgIndex) => {
    const updated = [...skuList];
    if (updated[skuIndex].images) {
      // Set tất cả ảnh khác thành không phải main
      updated[skuIndex].images.forEach(img => img.isMain = false);
      // Set ảnh được chọn thành main
      updated[skuIndex].images[imgIndex].isMain = true;
      setSkuList(updated);
    }
  };

  const handleRemoveSkuImage = (skuIndex, imgIndex) => {
    const updated = [...skuList];
    if (updated[skuIndex].images) {
      updated[skuIndex].images.splice(imgIndex, 1);
      setSkuList(updated);
    }
  };

  const regenerateSkus = () => {
    if (options.length >= 1 && options.some(opt => opt.values && opt.values.length > 0)) {
      const valuesList = options
        .filter(opt => opt.values && opt.values.length > 0)
        .map(opt =>
          opt.values.map(v => ({
            label: v.label,
            value: v.value || v.label,
            optionName: opt.name,
          }))
        );

      const combinations = getOptionCombinations(valuesList);

      const newSkus = combinations.map(combo => {
        return {
          combo,
          price_sale: 0,
          quantity: 0,
          status: 2,
          main_image_index: null,
          images: [],
        };
      });

      setSkuList(newSkus);
    }
  };

  const hasValidOptions = options.length >= 1 && options.some(opt => opt.values && opt.values.length > 0);

  if (!hasValidOptions) return null;

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Quản lý SKU theo tổ hợp option</h5>
        <Button variant="primary" size="sm" onClick={regenerateSkus}>
          <i className="bi bi-arrow-clockwise me-2"></i>
          Tạo SKU từ thuộc tính
        </Button>
      </div>
      
      {skuList.length === 0 ? (
        <div className="text-center py-4 text-muted">
          <i className="bi bi-info-circle me-2"></i>
          Chưa có SKU nào. Hãy nhấn nút "Tạo SKU từ thuộc tính" để tạo tự động từ các thuộc tính đã thiết lập.
        </div>
      ) : (
        <Table bordered size="sm" responsive>
        <thead>
          <tr>
            {options.map((opt, idx) => (
              <th key={idx}>{opt.name}</th>
            ))}
            <th>Giá bán</th>
            <th>Số lượng</th>
            <th>Ảnh</th>
            <th>Xoá</th>
          </tr>
        </thead>
        <tbody>
          {skuList.map((skuItem, index) => (
            <tr key={index}>
              {skuItem.combo.map((c, i) => (
                <td key={i}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {isHexColor(c.value) && (
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          backgroundColor: c.value,
                          border: "1px solid #ccc",
                          marginRight: 8,
                          borderRadius: 3,
                        }}
                        title={c.label}
                      />
                    )}
                    <span>{c.label}</span>
                  </div>
                </td>
              ))}
              <td>
                <Form.Control
                  type="number"
                  min={0}
                  value={skuItem.price_sale}
                  onChange={(e) =>
                    handleChange(index, "price_sale", parseInt(e.target.value) || 0)
                  }
                />
              </td>
              <td>
                <Form.Control
                  type="text"
                  min={0}
                  value={skuItem.quantity}
                  onChange={(e) =>
                    handleChange(index, "quantity", parseInt(e.target.value) || 0)
                  }
                />
              </td>
              
              {/* Cột upload ảnh cho SKU */}
              <td style={{ minWidth: 200 }}>
                <Form.Control
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleSkuImageUpload(e, index)}
                  size="sm"
                />
                <div className="d-flex flex-wrap gap-1 mt-2">
                  {(skuItem.images || []).map((img, imgIndex) => (
                    <div key={imgIndex} style={{ position: 'relative', width: 50, height: 50 }}>
                      <img
                        src={
                          img?.url
                            ? (img.url.startsWith("blob:") || img.url.startsWith("http"))
                              ? img.url
                              : API_CONFIG.getImageUrl(img.url)
                            : img?.Img_url
                              ? (img.Img_url.startsWith("blob:") || img.Img_url.startsWith("http"))
                                ? img.Img_url
                                : API_CONFIG.getImageUrl(img.Img_url)
                              : "/assets/image/no-image.jpg"
                        }
                        alt={`SKU ${index} Image ${imgIndex}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: 4,
                          border: img.isMain ? '2px solid #198754' : '1px solid #ccc'
                        }}
                      />
                      <div className="d-flex flex-column" style={{ position: 'absolute', top: 0, right: 0 }}>
                        <Button
                          variant={img.isMain ? "success" : "outline-secondary"}
                          size="sm"
                          style={{ fontSize: '8px', padding: '1px 3px' }}
                          onClick={() => handleSetMainImage(index, imgIndex)}
                          title="Set as main"
                        >
                          ★
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          style={{ fontSize: '8px', padding: '1px 3px' }}
                          onClick={() => handleRemoveSkuImage(index, imgIndex)}
                          title="Remove"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </td>
              <td>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    const updated = [...skuList];
                    updated.splice(index, 1);
                    setSkuList(updated);
                  }}
                >
                  <i className="bi bi-trash" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      )}
    </div>
  );
}

// Chỉ XÓA variants không còn cần thiết (và ảnh của chúng)
// if (variantsToDelete.length > 0) {
//   await ProductImg.destroy({ where: { id_variant: idsToDelete } });
//   await VariantValue.destroy({ where: { id_variant: idsToDelete } });
//   await ProductVariant.destroy({ where: { id_variant: idsToDelete } });
// }

// UPDATE variants existing (GIỮ NGUYÊN ảnh)
// for (const variantInfo of variantsToUpdate) {
//   await ProductVariant.update({
//     price_sale: ...,
//     quantity: ..., 
//     status: ...
//   }, { where: { id_variant: variantInfo.id_variant } });
// }

// Chỉ TẠO variants mới (và ảnh mới của chúng)
// for (const variantInfo of variantsToCreate) {
//   const newVariant = await ProductVariant.create(...);
//   // Process new variant images only
// }
