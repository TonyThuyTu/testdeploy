// Middleware để handle lỗi Multer
const multerErrorHandler = (err, req, res, next) => {
  if (err) {
    console.error('❌ Multer Error:', err);
    
    // Xử lý các loại lỗi Multer khác nhau
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File quá lớn! Tối đa 50MB mỗi file.',
        error: 'FILE_TOO_LARGE'
      });
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'Quá nhiều file! Tối đa 30 file.',
        error: 'TOO_MANY_FILES'
      });
    }
    
    if (err.code === 'LIMIT_FIELD_COUNT') {
      return res.status(400).json({
        message: 'Quá nhiều field! Tối đa 100 field.',
        error: 'TOO_MANY_FIELDS'
      });
    }
    
    if (err.code === 'LIMIT_FIELD_KEY') {
      return res.status(400).json({
        message: 'Tên field quá dài! Tối đa 200 ký tự.',
        error: 'FIELD_NAME_TOO_LONG'
      });
    }
    
    if (err.code === 'LIMIT_FIELD_VALUE') {
      return res.status(400).json({
        message: 'Giá trị field quá lớn! Tối đa 20MB.',
        error: 'FIELD_VALUE_TOO_LARGE'
      });
    }
    
    if (err.code === 'LIMIT_PART_COUNT') {
      return res.status(400).json({
        message: 'Quá nhiều parts! Tối đa 200 parts.',
        error: 'TOO_MANY_PARTS'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'File không mong muốn! Kiểm tra lại tên field.',
        error: 'UNEXPECTED_FILE'
      });
    }
    
    // Lỗi file type không hợp lệ
    if (err.message && err.message.includes('Chỉ hỗ trợ ảnh và video')) {
      return res.status(400).json({
        message: 'Định dạng file không hợp lệ! Chỉ hỗ trợ ảnh và video.',
        error: 'INVALID_FILE_TYPE'
      });
    }
    
    // Lỗi Multer khác
    return res.status(400).json({
      message: 'Lỗi upload file: ' + (err.message || 'Unknown error'),
      error: err.code || 'UPLOAD_ERROR'
    });
  }
  
  next();
};

module.exports = multerErrorHandler;
