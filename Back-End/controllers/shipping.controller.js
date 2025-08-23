const db = require('../models/index.model');
const Order = db.Order;
const ShippingInfo = db.ShippingInfo;

// Shipping simulation service
class ShippingSimulation {
  constructor() {
    this.simulationIntervals = new Map();
  }

  // Generate unique shipping code
  generateShippingCode(orderId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `SP${orderId}${timestamp}${random}`.toUpperCase();
  }

  // Start shipping simulation for an order
  async startSimulation(orderId) {
    try {
      const order = await Order.findByPk(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Generate shipping code
      const shippingCode = this.generateShippingCode(orderId);

      // Create shipping info record
      await ShippingInfo.create({
        id_order: orderId,
        shipping_code: shippingCode,
        shipping_status: 'pending', // pending -> confirmed -> shipping -> delivered
        expected_delivery: new Date(Date.now() + 20 * 60 * 1000) // 20 minutes from now
      });

      // Start the simulation timeline
      this.scheduleStatusUpdates(orderId, shippingCode);

      return shippingCode;
    } catch (error) {
      console.error('Error starting shipping simulation:', error);
      throw error;
    }
  }

  // Schedule automatic status updates
  scheduleStatusUpdates(orderId, shippingCode) {
    const stages = [
      { status: 'confirmed', delay: 2 * 60 * 1000 }, // 2 minutes: order confirmed
      { status: 'preparing', delay: 5 * 60 * 1000 }, // 5 minutes: preparing package
      { status: 'shipping', delay: 10 * 60 * 1000 }, // 10 minutes: shipped
      { status: 'in_transit', delay: 15 * 60 * 1000 }, // 15 minutes: in transit
      { status: 'delivered', delay: 20 * 60 * 1000 }  // 20 minutes: delivered
    ];

    // Clear any existing simulation for this order
    if (this.simulationIntervals.has(orderId)) {
      this.simulationIntervals.get(orderId).forEach(timeout => clearTimeout(timeout));
    }

    const timeouts = [];

    stages.forEach(stage => {
      const timeout = setTimeout(async () => {
        try {
          await this.updateShippingStatus(orderId, stage.status);
          
          // Randomly simulate delivery failure for COD orders
          if (stage.status === 'delivered') {
            const order = await Order.findByPk(orderId);
            if (order.payment_method === 'COD') {
              // 20% chance of delivery failure
              const deliverySuccess = Math.random() > 0.2;
              await this.handleDeliveryComplete(orderId, deliverySuccess);
            } else {
              await this.handleDeliveryComplete(orderId, true);
            }
          }
        } catch (error) {
          console.error(`Error updating shipping status to ${stage.status}:`, error);
        }
      }, stage.delay);

      timeouts.push(timeout);
    });

    this.simulationIntervals.set(orderId, timeouts);
  }

  // Update shipping status
  async updateShippingStatus(orderId, status) {
    try {
      const updateData = {
        shipping_status: status
      };

      // Set appropriate timestamps based on status
      if (status === 'shipping') {
        updateData.shipped_at = new Date();
      } else if (status === 'delivered') {
        updateData.delivered_at = new Date();
      }

      await ShippingInfo.update(
        updateData,
        {
          where: { id_order: orderId }
        }
      );

      console.log(`✅ Shipping status updated for order ${orderId}: ${status}`);
      return true;
    } catch (error) {
      console.error('Error updating shipping status:', error);
      throw error;
    }
  }

  // Handle delivery completion
  async handleDeliveryComplete(orderId, deliverySuccess = true) {
    try {
      const order = await Order.findByPk(orderId);
      if (!order) return;

      // If COD payment
      if (order.payment_method === 'COD') {
        if (deliverySuccess) {
          // Giao hàng thành công
          await Order.update(
            {
              payment_status: 'paid',
              order_status: 'completed'
            },
            {
              where: { id_order: orderId }
            }
          );
          console.log(`✅ COD payment completed for order ${orderId}`);
        } else {
          // Giao hàng thất bại
          await Order.update(
            {
              payment_status: 'failed',
              order_status: 'cancelled'
            },
            {
              where: { id_order: orderId }
            }
          );
          console.log(`❌ COD payment failed for order ${orderId}`);
        }
      } else {
        // For online payments, just update order status
        await Order.update(
          {
            order_status: deliverySuccess ? 'completed' : 'cancelled'
          },
          {
            where: { id_order: orderId }
          }
        );
      }

      // Clean up simulation
      if (this.simulationIntervals.has(orderId)) {
        this.simulationIntervals.get(orderId).forEach(timeout => clearTimeout(timeout));
        this.simulationIntervals.delete(orderId);
      }
    } catch (error) {
      console.error('Error handling delivery completion:', error);
    }
  }

  // Stop simulation for an order
  stopSimulation(orderId) {
    if (this.simulationIntervals.has(orderId)) {
      this.simulationIntervals.get(orderId).forEach(timeout => clearTimeout(timeout));
      this.simulationIntervals.delete(orderId);
      console.log(`Shipping simulation stopped for order ${orderId}`);
    }
  }

  // Get shipping status
  async getShippingStatus(orderId) {
    try {
      const shippingInfo = await ShippingInfo.findOne({
        where: { id_order: orderId }
      });
      return shippingInfo;
    } catch (error) {
      console.error('Error getting shipping status:', error);
      throw error;
    }
  }

  // Manually trigger delivery failure for testing
  async simulateDeliveryFailure(orderId) {
    try {
      // Stop any existing simulation
      this.stopSimulation(orderId);

      // Update shipping status to delivered
      await this.updateShippingStatus(orderId, 'delivered');

      // Trigger delivery failure
      await this.handleDeliveryComplete(orderId, false);

      return true;
    } catch (error) {
      console.error('Error simulating delivery failure:', error);
      throw error;
    }
  }
}

// Create singleton instance
const shippingSimulation = new ShippingSimulation();

// Controller functions
exports.getShippingInfo = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const shippingInfo = await shippingSimulation.getShippingStatus(orderId);
    
    if (!shippingInfo) {
      return res.status(404).json({
        message: 'Không tìm thấy thông tin giao hàng'
      });
    }

    res.json({
      message: 'Lấy thông tin giao hàng thành công',
      shippingInfo
    });
  } catch (error) {
    console.error('Error getting shipping info:', error);
    res.status(500).json({
      message: 'Lỗi server khi lấy thông tin giao hàng',
      error: error.message
    });
  }
};

exports.startShippingSimulation = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const shippingCode = await shippingSimulation.startSimulation(orderId);
    
    res.json({
      message: 'Bắt đầu mô phỏng giao hàng thành công',
      shippingCode
    });
  } catch (error) {
    console.error('Error starting shipping simulation:', error);
    res.status(500).json({
      message: 'Lỗi server khi bắt đầu mô phỏng giao hàng',
      error: error.message
    });
  }
};

exports.stopShippingSimulation = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    shippingSimulation.stopSimulation(orderId);
    
    res.json({
      message: 'Dừng mô phỏng giao hàng thành công'
    });
  } catch (error) {
    console.error('Error stopping shipping simulation:', error);
    res.status(500).json({
      message: 'Lỗi server khi dừng mô phỏng giao hàng',
      error: error.message
    });
  }
};

exports.simulateDeliveryFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const result = await shippingSimulation.simulateDeliveryFailure(orderId);
    
    res.json({
      message: 'Mô phỏng giao hàng thất bại thành công',
      result
    });
  } catch (error) {
    console.error('Error in simulate delivery failure route:', error);
    res.status(500).json({
      message: 'Lỗi server khi mô phỏng giao hàng thất bại',
      error: error.message
    });
  }
};

// Export the simulation instance for use in other controllers
exports.shippingSimulation = shippingSimulation;
