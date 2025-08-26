const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/sequelize');
const routes = require('./routes/index.route');
const redisClient = require('./config/redisClient');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Kết nối MySQL
(async () => {
  try {
    // Kết nối MySQL
    await sequelize.authenticate();
    console.log('✅ Kết nối MySQL thành công!');

    // Kết nối Redis
    await redisClient.connect();
    console.log('✅ Redis đã kết nối thành công!');

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌ Lỗi khi kết nối MySQL hoặc Redis:', err);
  }
})();

// Middlewares
// CORS config trực tiếp trong server.js
const allowedOrigins = [
  'http://localhost:3000',
  'https://www.taobro.click',
];

app.use(cors({
  origin: function (origin, callback) {
    // Log origin để debug
    console.log('🌍 Request từ origin:', origin);

    if (!origin) return callback(null, true); // Cho phép Postman, server-side

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`❌ Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true, // Cho phép cookie/token gửi kèm
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static file cho ảnh upload
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API routes
app.use('/api', routes);

// Route test
app.get('/', (req, res) => {
  res.send('🚀 Welcome to my AppleStore API');
});
