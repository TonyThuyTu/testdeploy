// utils/momo.js
const https = require('https');
const crypto = require('crypto');

async function createMoMoPaymentUrl({ amount, orderId, orderInfo }) {
  return new Promise((resolve, reject) => {
    // MoMo Test Environment Credentials (official)
    const partnerCode = 'MOMO';
    const accessKey = 'F8BBA842ECF85';
    const secretKey = 'K951B6PE1waDMi640xX08PD3vg6EkVlz';
    const requestId = partnerCode + Date.now();
    const redirectUrl = process.env.MOMO_REDIRECT_URL;
    const ipnUrl = process.env.MOMO_NOTIFY_URL;
    const requestType = 'payWithMethod';
    const extraData = '';

    const rawSignature =
      `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}` +
      `&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}` +
      `&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}` +
      `&requestId=${requestId}&requestType=${requestType}`;

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex');

    const requestBody = JSON.stringify({
      partnerCode,
      partnerName: "Test",
      storeId: "MomoTestStore",
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      lang: 'vi',
      extraData,
      requestType,
      signature
    });

    const options = {
      hostname: 'test-payment.momo.vn',
      port: 443,
      path: '/v2/gateway/api/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('MoMo API Response:', result);
          
          if (result.payUrl) {
            resolve(result.payUrl);
          } else {
            console.error('MoMo Error:', result);
            reject(new Error(result.message || 'Không tạo được link MoMo'));
          }
        } catch (err) {
          console.error('MoMo Parse Error:', err);
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

module.exports = { createMoMoPaymentUrl };
