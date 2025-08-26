const { createClient } = require('redis');

const redisClient = createClient({
  // url: 'redis://redis:6379', // ✅ sửa lại IP localhost
   url: process.env.REDIS_URL || 'redis://default:ctznwrNlh0fAQ5rppPuqEuyKUgD8xTrn@redis-17355.c270.us-east-1-3.ec2.redns.redis-cloud.com:17355', // sử dụng biến môi trường
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));

module.exports = redisClient;


// import { createClient } from 'redis';

// const client = createClient({
//     username: 'default',
//     password: 'ctznwrNlh0fAQ5rppPuqEuyKUgD8xTrn',
//     socket: {
//         host: 'redis-17355.c270.us-east-1-3.ec2.redns.redis-cloud.com',
//         port: 17355
//     }
// });

// client.on('error', err => console.log('Redis Client Error', err));

// await client.connect();

// await client.set('foo', 'bar');
// const result = await client.get('foo');
// console.log(result)  // >>> bar

