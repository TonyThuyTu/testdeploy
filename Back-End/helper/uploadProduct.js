const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Tạo thư mục upload nếu chưa có
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Cấu hình Multer cho sản phẩm: cho phép nhiều file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext).replace(/\s+/g, "-"); // xoá khoảng trắng
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

// ✅ Lọc định dạng file
const fileFilter = function (req, file, cb) {
  const allowedTypes = /\.(mp4|mov|avi|mkv|webm|jpeg|jpg|png|gif|webp)$/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ hỗ trợ ảnh và video!"), false);
  }
};

// ✅ Multer config cho sản phẩm - cho phép nhiều file
const uploadProduct = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // tối đa 50MB mỗi file
    files: 30, // tối đa 30 file
    fieldSize: 20 * 1024 * 1024, // tối đa 20MB cho field
    fieldNameSize: 200, // tối đa 200 ký tự cho tên field
    fields: 100, // tối đa 100 field
    parts: 200, // tối đa 200 parts (files + fields)
  },
});

module.exports = uploadProduct;
