const db = require('../models/index.model');
const { Op } = require('sequelize');

exports.getDashboardData = async (req, res) => {
  try {
    console.log('Starting getDashboardData with real data...');
    
    const { startDate, endDate } = req.query;
    const now = new Date();
    let currentStartDate, currentEndDate, lastStartDate, lastEndDate;

    if (startDate && endDate) {
      // Sử dụng khoảng thời gian được chỉ định
      currentStartDate = new Date(startDate);
      currentEndDate = new Date(endDate);
      
      // Tính toán khoảng thời gian trước đó với cùng độ dài
      const daysDiff = Math.ceil((currentEndDate - currentStartDate) / (1000 * 60 * 60 * 24));
      lastStartDate = new Date(currentStartDate.getTime() - daysDiff * 24 * 60 * 60 * 1000);
      lastEndDate = new Date(currentStartDate.getTime() - 1 * 24 * 60 * 60 * 1000);
    } else {
      // Sử dụng tháng hiện tại (mặc định)
      currentStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEndDate = now;
      lastStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      lastEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    const currentMonthOrders = await db.Order.findAll({
      where: {
        order_date: {
          [Op.gte]: currentStartDate,
          [Op.lte]: currentEndDate
        },
        order_status: {
          [Op.not]: -1 
        }
      },
      attributes: ['total_amount']
    });

    const lastMonthOrders = await db.Order.findAll({
      where: {
        order_date: {
          [Op.gte]: lastStartDate,
          [Op.lte]: lastEndDate
        },
        order_status: {
          [Op.not]: -1 
        }
      },
      attributes: ['total_amount']
    });

    const currentRevenue = currentMonthOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
    const lastRevenue = lastMonthOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
    const currentOrderCount = currentMonthOrders.length;
    const lastOrderCount = lastMonthOrders.length;

    console.log('Growth calculation debug:');
    console.log('Current period:', currentStartDate.toISOString(), 'to', currentEndDate.toISOString());
    console.log('Last period:', lastStartDate.toISOString(), 'to', lastEndDate.toISOString());
    console.log('Current revenue:', currentRevenue, 'Last revenue:', lastRevenue);
    console.log('Current orders:', currentOrderCount, 'Last orders:', lastOrderCount);

    const revenueGrowth = lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue * 100).toFixed(1) : 
                          (currentRevenue > 0 ? 100 : 0);
    const orderGrowth = lastOrderCount > 0 ? ((currentOrderCount - lastOrderCount) / lastOrderCount * 100).toFixed(1) : 
                        (currentOrderCount > 0 ? 100 : 0);

    console.log('Revenue growth:', revenueGrowth, 'Order growth:', orderGrowth);

    const totalCustomers = await db.Customer.count({
      where: { status: true }
    });

    const totalProducts = await db.Product.count({
      where: { products_status: 1 }
    });

    const avgOrderValue = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;

    const dashboardData = {
      thisMonth: {
        revenue: currentRevenue,
        orders: currentOrderCount,
        avgOrder: avgOrderValue
      },
      growth: {
        revenue: parseFloat(revenueGrowth),
        orders: parseFloat(orderGrowth)
      },
      totals: {
        customers: totalCustomers,
        products: totalProducts
      }
    };

    console.log('Real dashboard data prepared:', dashboardData);

    res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy dữ liệu dashboard',
      error: error.message
    });
  }
};

exports.getRevenueChart = async (req, res) => {
  try {
    console.log('Starting getRevenueChart with real data...');
    
    const { period = 'month', year, startDate, endDate } = req.query;
    const now = new Date();
    const chartData = [];

    if (startDate && endDate) {
      // Lọc theo khoảng thời gian tùy chỉnh
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (period === 'day') {
        // Hiển thị theo ngày trong khoảng thời gian
        const currentDate = new Date(start);
        while (currentDate <= end) {
          const dayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
          const dayEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59);

          const dayOrders = await db.Order.findAll({
            where: {
              order_date: {
                [Op.gte]: dayStart,
                [Op.lte]: dayEnd
              },
              order_status: {
                [Op.not]: -1 
              }
            },
            attributes: ['total_amount']
          });

          const revenue = dayOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
          
          chartData.push({
            period: currentDate.toISOString().split('T')[0],
            total_revenue: revenue,
            total_orders: dayOrders.length,
            growth_rate: 0 // Tính toán growth rate nếu cần
          });

          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        // Hiển thị theo tháng trong khoảng thời gian
        const currentMonth = new Date(start.getFullYear(), start.getMonth(), 1);
        const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
        
        while (currentMonth <= endMonth) {
          const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
          const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

          const monthOrders = await db.Order.findAll({
            where: {
              order_date: {
                [Op.gte]: monthStart,
                [Op.lte]: monthEnd
              },
              order_status: {
                [Op.not]: -1 
              }
            },
            attributes: ['total_amount']
          });

          const revenue = monthOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
          
          chartData.push({
            period: `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`,
            total_revenue: revenue,
            total_orders: monthOrders.length,
            growth_rate: 0
          });

          currentMonth.setMonth(currentMonth.getMonth() + 1);
        }
      }
    } else {
      // Logic mặc định (6 tháng gần đây)
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

        const monthOrders = await db.Order.findAll({
          where: {
            order_date: {
              [Op.gte]: monthStart,
              [Op.lte]: monthEnd
            },
            order_status: {
              [Op.not]: -1 
            }
          },
          attributes: ['total_amount']
        });

        const revenue = monthOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);

        chartData.push({
          period: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
          total_revenue: revenue,
          total_orders: monthOrders.length,
          growth_rate: 0
        });
      }
    }

    console.log('Real chart data prepared:', chartData);

    res.status(200).json({
      success: true,
      data: chartData
    });

  } catch (error) {
    console.error('Error fetching revenue chart data:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy dữ liệu biểu đồ doanh thu',
      error: error.message
    });
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    console.log('Starting getTopProducts with real data...');
    
    const { period = 'month', limit = 5, startDate, endDate } = req.query;
    const now = new Date();
    let dateFilter;

    if (startDate && endDate) {
      // Sử dụng khoảng thời gian tùy chỉnh
      dateFilter = {
        [Op.gte]: new Date(startDate),
        [Op.lte]: new Date(endDate)
      };
    } else {
      // Sử dụng khoảng thời gian mặc định
      let daysAgo;
      switch (period) {
        case 'week':
          daysAgo = 7;
          break;
        case 'month':
          daysAgo = 30;
          break;
        case 'quarter':
          daysAgo = 90;
          break;
        case 'year':
          daysAgo = 365;
          break;
        default:
          daysAgo = 30;
      }
      
      const pastDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      dateFilter = {
        [Op.gte]: pastDate
      };
    }

    const topProducts = await db.OrderDetail.findAll({
      attributes: [
        'id_product',
        'product_name',
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_sold'],
        [db.sequelize.fn('SUM', db.sequelize.literal('quantity * final_price')), 'total_revenue']
      ],
      include: [{
        model: db.Order,
        as: 'order',
        where: {
          order_date: dateFilter,
          order_status: {
            [Op.not]: -1 
          }
        },
        attributes: []
      }],
      group: ['id_product', 'product_name'],
      order: [[db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'DESC']],
      limit: parseInt(limit),
      raw: true
    });

    const formattedProducts = topProducts.map((product, index) => ({
      id: product.id_product,
      name: product.product_name,
      sales: parseInt(product.total_sold),
      revenue: parseFloat(product.total_revenue)
    }));

    console.log('Real top products data prepared:', formattedProducts);

    res.status(200).json({
      success: true,
      data: formattedProducts
    });

  } catch (error) {
    console.error('Error fetching top products data:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy dữ liệu sản phẩm bán chạy',
      error: error.message
    });
  }
};

exports.getDetailedStats = async (req, res) => {
  try {
    console.log('Starting getDetailedStats...');
    
    const { startDate, endDate } = req.query;
    const now = new Date();
    let dateFilter;

    if (startDate && endDate) {
      dateFilter = {
        [Op.gte]: new Date(startDate),
        [Op.lte]: new Date(endDate)
      };
    } else {
      // 30 ngày qua
      const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = {
        [Op.gte]: pastDate
      };
    }

    // Thống kê đơn hàng theo trạng thái
    const ordersByStatus = await db.Order.findAll({
      attributes: [
        'order_status',
        [db.sequelize.fn('COUNT', db.sequelize.col('id_order')), 'count']
      ],
      where: {
        order_date: dateFilter
      },
      group: ['order_status'],
      raw: true
    });


    const statusMap = {
      0: 'pending',
      1: 'confirmed', 
      2: 'shipping',
      3: 'delivered',
      '-1': 'cancelled'
    };

    const formattedOrdersByStatus = ordersByStatus.map(item => ({
      status: statusMap[item.order_status] || 'unknown',
      count: parseInt(item.count)
    }));

    // Doanh thu theo danh mục (cần join với bảng categories)
    const revenueByCategory = await db.OrderDetail.findAll({
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.literal('quantity * final_price')), 'revenue']
      ],
      include: [
        {
          model: db.Order,
          as: 'order',
          where: {
            order_date: dateFilter,
            order_status: {
              [Op.not]: -1
            }
          },
          attributes: []
        },
        {
          model: db.Product,
          as: 'product',
          include: [{
            model: db.Category,
            as: 'category',
            attributes: ['category_name']
          }],
          attributes: []
        }
      ],
      group: ['product.category.id_category'],
      order: [[db.sequelize.fn('SUM', db.sequelize.literal('quantity * final_price')), 'DESC']],
      raw: true,
      limit: 5
    });

    // Thống kê khách hàng mới vs cũ
    const totalCustomersInPeriod = await db.Order.count({
      where: {
        order_date: dateFilter
      },
      distinct: true,
      col: 'id_customer'
    });

    const newCustomers = await db.Customer.count({
      where: {
        created_at: dateFilter
      }
    });

    // Tính toán giá trị đơn hàng trung bình
    const ordersInPeriod = await db.Order.findAll({
      where: {
        order_date: dateFilter,
        order_status: {
          [Op.not]: -1
        }
      },
      attributes: ['total_amount']
    });

    const totalRevenue = ordersInPeriod.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
    const averageOrderValue = ordersInPeriod.length > 0 ? totalRevenue / ordersInPeriod.length : 0;

    // Tỷ lệ chuyển đổi giả định (có thể tính từ traffic website)
    const conversionRate = Math.random() * 5 + 2; // Mock data

    const detailedStats = {
      ordersByStatus: formattedOrdersByStatus,
      revenueByCategory: revenueByCategory.map(item => ({
        categoryName: item['product.category.category_name'] || 'Khác',
        revenue: parseFloat(item.revenue || 0)
      })),
      customerStats: {
        newCustomers: newCustomers,
        returningCustomers: totalCustomersInPeriod - newCustomers
      },
      averageOrderValue: averageOrderValue,
      conversionRate: conversionRate
    };

    console.log('Detailed stats prepared:', detailedStats);

    res.status(200).json({
      success: true,
      data: detailedStats
    });

  } catch (error) {
    console.error('Error fetching detailed stats:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thống kê chi tiết',
      error: error.message
    });
  }
};