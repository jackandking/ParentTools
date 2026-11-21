// utils/api.js
// 统一 API 服务 —— 支付页 (pages/pay) 依赖
// 后端: letmetry_web_service (letmetry.cn)，路由 /api/order/* 与 /api/pay/*
// 注意: 返回值保持 ks.request 的响应对象形态 ({statusCode, data})，与 pay.js 的消费方式一致

const BASE_URL = 'https://letmetry.cn';

function request(options) {
  return new Promise((resolve, reject) => {
    ks.request(Object.assign({}, options, {
      success: resolve,
      fail: reject
    }));
  });
}

const api = {
  order: {
    // 创建订单 → {statusCode, data: {success, data: {order_id, status: 'pending'}}}
    create: function (orderData) {
      return request({
        url: BASE_URL + '/api/order/create',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: orderData
      });
    },
    // 查询订单 → {data: {success, data: {order_id, status, ...}}}
    query: function (orderId) {
      return request({
        url: BASE_URL + '/api/order/query/' + encodeURIComponent(orderId),
        method: 'GET'
      });
    }
  },
  pay: {
    // 获取支付参数 → {data: {success, data: {prepayId, order_info_token, ...}}}
    check: function (orderId) {
      return request({
        url: BASE_URL + '/api/pay/check/' + encodeURIComponent(orderId),
        method: 'GET'
      });
    },
    // 支付结果通知 → 后端 handleNotify 期望 {out_order_no, result}
    notify: function (orderId, status) {
      return request({
        url: BASE_URL + '/api/pay/notify',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: {
          out_order_no: orderId,
          result: status
        }
      });
    }
  }
};

module.exports = api;
