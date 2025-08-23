const db = require('../models/index.model');
const sendOrderConfirmationEmail = require('../utils/mailCheckOut');
const { Op, Sequelize } = require('sequelize');
const crypto = require('crypto');
const { createMoMoPaymentUrl } = require('../utils/momoPayment');
const { shippingSimulation } = require('./shipping.controller');

exports.checkout = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      id_customer,
      name,
      phone,
      email,
      address,
      payment_method,
      cart_items,
      note,
      total_amount: totalAmountFromClient,
    } = req.body;

    // Kiểm tra dữ liệu bắt buộc
    if (
      !id_customer ||
      !name ||
      !phone ||
      !email ||
      !address ||
      !payment_method ||
      !Array.isArray(cart_items) ||
      cart_items.length === 0
    ) {
      return res.status(400).json({ message: "Thiếu thông tin đơn hàng." });
    }

    const paymentMethodMap = { 1: "cod", 2: "online" };
    const paymentMethodText = paymentMethodMap[payment_method];
    if (!paymentMethodText) {
      return res
        .status(400)
        .json({ message: "Phương thức thanh toán không hợp lệ." });
    }

    let total_amount = 0;
    const shipping_fee = 0;
    const orderDetails = [];

    for (const item of cart_items) {
      const product = await db.Product.findByPk(item.id_product);
      if (!product) throw new Error(`Sản phẩm với ID ${item.id_product} không tồn tại.`);

      // Lấy giá đơn giá từ frontend gửi lên
      const price = parseFloat(item.price);
      if (isNaN(price) || price <= 0) {
        throw new Error(`Giá sản phẩm ID ${item.id_product} không hợp lệ.`);
      }

      // Lấy mô tả option nếu có
      let products_item = item.products_item || "";
      if (!products_item && item.attribute_values && item.attribute_values.length > 0) {
        const arr = item.attribute_values.map(av => {
          const attrVal = av.attribute_value;
          if (!attrVal) return "";
          if (attrVal.attribute && Number(attrVal.attribute.type) === 2) {
            return attrVal.value_note || "";
          } else {
            return attrVal.value || "";
          }
        }).filter(Boolean);
        products_item = arr.join(", ");
      }

      const itemTotal = price * item.quantity;
      total_amount += itemTotal;

      orderDetails.push({
        id_product: item.id_product,
        product_name: product.products_name,
        quantity: item.quantity,
        final_price: price,
        products_item,
        options: item.attribute_value_ids || []
    });
    console.log(`Product ${product.products_name} price calculated: ${price}`);
    }

    // Xác định tổng tiền lưu vào DB
    const totalAmountToSave =
      !isNaN(parseFloat(totalAmountFromClient)) && totalAmountFromClient > 0
        ? parseFloat(totalAmountFromClient)
        : total_amount;

    // Tạo order trước (sẽ có ID thật để dùng cho MoMo)
    const newOrder = await db.Order.create(
      {
        id_customer,
        name,
        phone,
        email,
        address,
        total_amount: totalAmountToSave,
        shipping_fee,
        payment_method,
        order_status: 'pending', // COD = confirmed, Online = pending
        payment_status: 'pending', // COD = paid, Online = pending chờ MoMo
        note,
      },
      { transaction: t }
    );

    // Tạo OrderDetail và Option nếu có
    for (const detail of orderDetails) {
      const orderDetail = await db.OrderDetail.create(
        {
          id_order: newOrder.id_order,
          id_product: detail.id_product,
          product_name: detail.product_name,
          quantity: detail.quantity,
          final_price: detail.final_price,
          products_item: detail.products_item,
        },
        { transaction: t }
      );

      if (detail.options.length > 0) {
        const optionRecords = detail.options.map((id_value) => ({
          id_order_detail: orderDetail.id_order_detail,
          id_value,
        }));
        await db.OrderItemAttributeValue.bulkCreate(optionRecords, {
          transaction: t,
        });
      }
    }

    // Cập nhật payment_status cho COD
    if (payment_method === 1) {
      await newOrder.update(
        { payment_status: 'pending' },
        { transaction: t }
      );
    }

    // Gửi mail nếu COD
    if (payment_method === 1) {
      await sendOrderConfirmationEmail(email, {
        id_order: newOrder.id_order,
        name,
        phone,
        email,
        address,
        total_amount: totalAmountToSave,
        payment_method: paymentMethodText,
        order_date: newOrder.order_date,
        products: orderDetails,
        note,
      });
    }

    // Cart will be cleared by frontend after successful order

    await t.commit();

    // Tạo link MoMo sau khi đã commit order (dùng order ID thật)
    let payUrl = null;
    if (payment_method === 2) {
      try {
        payUrl = await createMoMoPaymentUrl({
          amount: totalAmountToSave.toString(),
          orderId: `ORDER_${newOrder.id_order}`, // Dùng order ID thật
          orderInfo: `Thanh toán đơn hàng ${newOrder.id_order}`,
        });
      } catch (err) {
        return res.status(500).json({ 
          message: "Đơn hàng đã được tạo nhưng có lỗi thanh toán MoMo", 
          error: err.message,
          orderId: newOrder.id_order
        });
      }
    }

    // Start shipping simulation only for COD orders (online payments wait for IPN)
    if (payment_method === 1) {
      try {
        await shippingSimulation.startSimulation(newOrder.id_order);
        console.log(`✅ Shipping simulation started for COD order ${newOrder.id_order}`);
      } catch (shippingError) {
        console.error('Error starting shipping simulation:', shippingError);
        // Don't fail the order creation if shipping simulation fails
      }
    }

    return res.status(200).json({
      message:
        payment_method === 2
          ? "Tạo đơn thành công, vui lòng thanh toán online"
          : "Đặt hàng thành công",
      order_id: newOrder.id_order,
      payment_method: paymentMethodText,
      ...(payment_method === 2 ? { payUrl } : {}),
    });
  } catch (error) {
    await t.rollback();
    console.error("Checkout Error:", error);
    return res.status(500).json({ message: "Lỗi khi đặt hàng", error: error.message });
  }
};

// IPN MoMo - đơn giản có gửi mail
exports.momoIPN = async (req, res) => {
  try {
    const {
      orderId,
      resultCode,
      message,
      transId
    } = req.body;

    const realOrderId = orderId.replace('ORDER_', '');

    // Tìm order trong DB
    const order = await db.Order.findByPk(realOrderId);
    if (!order) {
      return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
    }

    if (resultCode == 0) {
      await order.update({
        order_status: 'confirmed',
        payment_status: 'paid',
        note: order.note
          ? `${order.note}\nMã giao dịch: ${transId}`
          : `Mã giao dịch: ${transId}`
      });

      console.log(`✅ Payment success for order ${realOrderId}`);

      // Gửi mail xác nhận
      try {
        const orderDetails = await db.OrderDetail.findAll({
          where: { id_order: realOrderId }
        });

        await sendOrderConfirmationEmail(order.email, {
          id_order: order.id_order,
          name: order.name,
          phone: order.phone,
          email: order.email,
          address: order.address,
          total_amount: order.total_amount,
          payment_method: 'online',
          order_date: order.order_date,
          products: orderDetails.map(detail => ({
            product_name: detail.product_name,
            quantity: detail.quantity,
            final_price: detail.final_price,
            products_item: detail.products_item
          })),
          note: order.note,
        });

      } catch (emailErr) {
        console.error('❌ Send mail failed:', emailErr);
      }

    } else {
      await order.update({
        order_status: 'failed',
        payment_status: 'failed',
        note: order.note
          ? `${order.note}\nThanh toán thất bại: ${message} (Mã GD: ${transId})`
          : `Thanh toán thất bại: ${message} (Mã GD: ${transId})`
      });
      console.log(`❌ Payment failed for order ${realOrderId}`);
    }

    return res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('MoMo IPN error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


//get list
exports.getAllOrders = async (req, res) => {
  try {
    // Lấy query params
    const {
      page = 1,
      limit = 7,
      payment_method,
      order_status,
      payment_status,
      order_date,
      
    } = req.query;

    const offset = (page - 1) * limit;

    // Thêm điều kiện lọc payment_status
    const whereOrder = {};
    if (payment_method) whereOrder.payment_method = payment_method;
    if (order_status) whereOrder.order_status = order_status;
    if (payment_status) whereOrder.payment_status = payment_status;

    const { count, rows: orders } = await db.Order.findAndCountAll({
      where: whereOrder,
      include: [
        {
          model: db.Customer,
          as: 'customer',
          attributes: ['name'],
        },
      ],
      attributes: [
        'id_order',
        'name',
        'phone',
        'email',
        'address',
        'total_amount',
        'payment_method',
        'order_date',
        'order_status',
        'payment_status'
      ],
      order: [['order_date', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
      distinct: true, // để count đúng khi join
    });

    // Map lại dữ liệu trả về
    const shippingStatusMap = {
      'pending': 1,
      'delivering': 2,
      'delivered': 3,
      'cancelled': 4
    };

    const formatted = orders.map(order => {
      const shipping_status_text = order.shipping_info?.shipping_status || 'pending';
      const shipping_status = shippingStatusMap[shipping_status_text] || 1;

      return {
        id: order.id_order,
        name: order.name,
        email: order.email,
        phone: order.phone,
        address: order.address,
        total_amount: order.total_amount,
        customer_name: order.customer?.name || '',
        payment_method: order.payment_method,
        order_status: order.order_status,
        order_date: order.order_date,
        payment_status: order.payment_status, // Sử dụng trực tiếp từ database
        shipping_status,
        shipping_status_text,
      };
    });

    res.status(200).json({
      total: count,
      page: Number(page),
      pageSize: Number(limit),
      data: formatted,
    });

  } catch (error) {
    console.error("Lỗi lấy danh sách đơn hàng:", error);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách đơn hàng." });
  }
};

//get detail
exports.getOrderDetail = async (req, res) => {
  const id = req.params.id;

  try {
    const order = await db.Order.findOne({
      where: { id_order: id },
        attributes: [
          'id_order', 'id_customer', 'name', 'phone', 'email',
          'address', 'total_amount', 'payment_method', 'order_status','payment_status',
          'order_date', 'shipping_fee', 'note'
        ],
      include: [
        {
          model: db.Customer,
          as: 'customer',
          attributes: ['name', 'email', 'phone', 'given_name', 'last_name'],
        },

        {
          model: db.ShippingInfo,
          as: 'shipping_info',
          attributes: ['shipping_code', 'shipping_status'],
        },
        {
          model: db.OrderDetail,
          as: 'order_details',
          include: [
            {
              model: db.Product,
              as: 'product',
              attributes: [
                'id_products', 'products_name', 'products_slug',
                'products_market_price', 'products_sale_price',
              ],
              include: [
                {
                  model: db.ProductAttributeValue,
                  as: 'productAttributeValues',
                  include: [
                    {
                      model: db.AttributeValue,
                      as: 'attributeValue',
                      attributes: ['extra_price'],
                    }
                  ]
                }
              ],
            },
            {
              model: db.OrderItemAttributeValue,
              as: 'attribute_values',
              include: [
                {
                  model: db.AttributeValue,
                  as: 'attribute_value',
                  attributes: ['value', 'value_note', 'extra_price'],
                  include: [
                    {
                      model: db.Attribute,
                      as: 'attribute',
                      attributes: ['name', 'type']
                    }
                  ]
                },
              ],
            }
          ],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error('Lỗi lấy chi tiết đơn hàng:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy chi tiết đơn hàng' });
  }
};

exports.getOrdersByCustomerId = async (req, res) => {
  const customerId = req.params.id;

  if (!customerId) {
    return res.status(400).json({ error: "Thiếu id khách hàng" });
  }

  try {
    const orders = await db.Order.findAll({
      where: { id_customer: customerId },
      attributes: [
        "id_order",
        "order_date",
        "payment_method",
        "order_status",
        "payment_status",
        "total_amount",
      ],
      order: [["id_order", "DESC"]],
    });

    return res.json(orders);
  } catch (error) {
    console.error("Lỗi lấy đơn hàng theo khách hàng:", error);
    return res.status(500).json({ error: "Lỗi server" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { order_status, payment_status } = req.body;

  // Danh sách trạng thái hợp lệ
  const validOrderStatuses = ['pending', 'processing', 'confirmed', 'completed', 'cancelled'];
  const validPaymentStatuses = ['pending', 'paid', 'failed'];

  try {
    // Kiểm tra tính hợp lệ của trạng thái đơn hàng
    if (order_status && !validOrderStatuses.includes(order_status)) {
      return res.status(400).json({ 
        message: 'Trạng thái đơn hàng không hợp lệ',
        validOrderStatuses 
      });
    }

    // Kiểm tra tính hợp lệ của trạng thái thanh toán
    if (payment_status && !validPaymentStatuses.includes(payment_status)) {
      return res.status(400).json({ 
        message: 'Trạng thái thanh toán không hợp lệ',
        validPaymentStatuses 
      });
    }

    const order = await db.Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    // Kiểm tra điều kiện chuyển trạng thái đơn hàng
    if (order_status) {
      const currentStatus = order.order_status;
      const isValidOrderTransition = 
        (currentStatus === 'pending' && ['processing', 'confirmed', 'cancelled'].includes(order_status)) ||
        (currentStatus === 'processing' && ['confirmed', 'cancelled'].includes(order_status)) ||
        (currentStatus === 'confirmed' && ['completed', 'cancelled'].includes(order_status)) ||
        (currentStatus === order_status); // Cho phép giữ nguyên trạng thái

      if (!isValidOrderTransition) {
        return res.status(400).json({ 
          message: `Không thể chuyển từ trạng thái ${currentStatus} sang ${order_status}` 
        });
      }
    }

    // Kiểm tra điều kiện chuyển trạng thái thanh toán
    if (payment_status) {
      const currentPaymentStatus = order.payment_status;
      const isValidPaymentTransition = 
        (currentPaymentStatus === 'pending' && ['paid', 'failed'].includes(payment_status)) ||
        (currentPaymentStatus === payment_status); // Cho phép giữ nguyên trạng thái

      if (!isValidPaymentTransition) {
        return res.status(400).json({ 
          message: `Không thể chuyển từ trạng thái thanh toán ${currentPaymentStatus} sang ${payment_status}` 
        });
      }
    }

    // Chuẩn bị dữ liệu cập nhật
    const updateData = {};
    if (order_status) updateData.order_status = order_status;
    if (payment_status) updateData.payment_status = payment_status;

    // Cập nhật trạng thái
    await order.update(updateData);

    res.json({ 
      message: 'Cập nhật hàng thành công',
      order_status: order.order_status,
      payment_status: order.payment_status
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
    res.status(500).json({ 
      message: 'Lỗi server khi cập nhật trạng thái đơn hàng',
      error: error.message 
    });
  }
};

// API để lấy danh sách enum cho order và payment status
exports.getOrderEnums = async (req, res) => {
  try {
    const orderStatuses = ['pending', 'processing', 'confirmed', 'completed', 'cancelled'];
    const paymentStatuses = ['pending', 'paid', 'failed'];
    const paymentMethods = [
      { value: 1, label: 'COD (Thanh toán khi nhận hàng)' },
      { value: 2, label: 'Online (Thanh toán trực tuyến)' }
    ];

    res.json({
      orderStatuses,
      paymentStatuses,
      paymentMethods
    });
  } catch (error) {
    console.error('Lỗi khi lấy enum:', error);
    res.status(500).json({
      message: 'Lỗi server khi lấy danh sách enum',
      error: error.message
    });
  }
};

// API để frontend tự cập nhật trạng thái đơn hàng sau khi thanh toán MoMo thành công
exports.confirmOnlinePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'Thiếu orderId' });
    }
    // Tìm order
    const order = await db.Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    if (order.payment_status === 'paid') {
      return res.json({ 
        message: 'Đơn hàng đã được xác nhận trước đó',
        payment_status: order.payment_status 
      });
    }

    // Chỉ cho phép cập nhật nếu order đang pending và payment method là online
    if (order.payment_method !== 2) {
      return res.status(400).json({ message: 'Đơn hàng này không phải thanh toán online' });
    }

    if (order.order_status !== 'pending' || order.payment_status !== 'pending') {
      return res.status(400).json({ 
        message: 'Đơn hàng không ở trạng thái pending để có thể xác nhận',
        current_payment_status: order.payment_status
      });
    }

    // Cập nhật trạng thái
    await order.update({
      payment_status: 'paid',
      note: order.note ? `${order.note}\nXác nhận thanh toán thủ công từ frontend` : `Xác nhận thanh toán thủ công từ frontend`
    });

    console.log(`✅ Order ${orderId} manually confirmed as paid`);

    // Gửi email xác nhận
    try {
      const orderDetails = await db.OrderDetail.findAll({
        where: { id_order: orderId }
      });

      await sendOrderConfirmationEmail(order.email, {
        id_order: order.id_order,
        name: order.name,
        phone: order.phone,
        email: order.email,
        address: order.address,
        total_amount: order.total_amount,
        payment_method: 'online',
        order_date: order.order_date,
        products: orderDetails.map(detail => ({
          product_name: detail.product_name,
          quantity: detail.quantity,
          final_price: detail.final_price,
          products_item: detail.products_item
        })),
        note: order.note,
      });

    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    try {
      await shippingSimulation.startSimulation(orderId);
    } catch (shippingError) {
      console.error('Error starting shipping simulation:', shippingError);
    }

    res.json({
      message: 'Đơn hàng đã được xác nhận thành công',
      order_status: 'confirmed',
      payment_status: 'paid'
    });

  } catch (error) {
    console.error('Error confirming online payment:', error);
    res.status(500).json({ 
      message: 'Lỗi server khi xác nhận thanh toán',
      error: error.message 
    });
  }
};