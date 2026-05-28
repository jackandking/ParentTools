// pages/pay/pay.js
// 快手支付中转页 - 调起 ks.pay 完成支付

// 引入API服务
const api = require('../../utils/api');
const RETURN_URL_STORAGE_KEY = 'pending_payment_return_url';

// 本地日志工具 - 用于远程调试时记录日志
const debugLogger = {
  // 存储日志到本地缓存
  log: function (level, message, data = null) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        data: data ? JSON.stringify(data) : null
      };
      
      // 获取现有日志
      let logs = [];
      try {
        const stored = ks.getStorageSync('payment_debug_logs');
        if (stored && Array.isArray(stored)) {
          logs = stored;
        }
      } catch (e) {
        // 忽略读取错误
      }
      
      // 添加新日志（最多保留100条）
      logs.push(logEntry);
      if (logs.length > 100) {
        logs = logs.slice(-100);
      }
      
      // 保存日志
      ks.setStorageSync('payment_debug_logs', logs);
      
      // 同时在控制台输出（如果调试器连接正常）
      const consoleMsg = `[${timestamp}] [${level}] ${message}`;
      if (data) {
        console[level === 'error' ? 'error' : 'log'](consoleMsg, data);
      } else {
        console[level === 'error' ? 'error' : 'log'](consoleMsg);
      }
    } catch (e) {
      // 静默失败，不干扰主流程
    }
  },
  
  // 获取所有日志
  getLogs: function () {
    try {
      return ks.getStorageSync('payment_debug_logs') || [];
    } catch (e) {
      return [];
    }
  },
  
  // 清空日志
  clearLogs: function () {
    try {
      ks.removeStorageSync('payment_debug_logs');
    } catch (e) {
      // 忽略错误
    }
  },
  
  // 快捷方法
  info: function (message, data) {
    this.log('info', message, data);
  },
  
  error: function (message, data) {
    this.log('error', message, data);
  },
  
  debug: function (message, data) {
    this.log('debug', message, data);
  }
};

Page({
    data: {
        paying: false,
        orderId: '',
        errorMsg: '',
        openid: '',
        productId: 'test_product_real',
        quantity: 1,
        totalAmount: 1,
        subject: '支付订单',
        body: '完成当前内容解锁支付',
        paymentChannel: null, // 当前仅支持微信支付
        orderChannel: null, // 订单实际创建时使用的渠道
        showPaymentList: false, // 保留字段，当前不展示支付渠道切换
        paymentListInitialized: false, // 支付方式已初始化
        paymentParams: null, // 存储的支付参数
        amount: '0.01', // 默认金额，单位：元
        productName: '确认支付', // 默认商品名称
        awaitingPaymentResult: false
    },

    onLoad: function (options) {
        debugLogger.info('支付页面加载', options);
        debugLogger.debug('orderId from options:', options.orderId);
        debugLogger.debug('appId from options:', options.appId);
        debugLogger.debug('prepayId from options:', options.prepayId);
        debugLogger.debug('nonceStr from options:', options.nonceStr);
        debugLogger.debug('timeStamp from options:', options.timeStamp);
        debugLogger.debug('sign from options:', options.sign);
        debugLogger.debug('returnUrl from options:', options.returnUrl);

        const {
            orderId,
            appId,
            prepayId,
            nonceStr,
            timeStamp,
            sign,
            returnUrl
        } = options;

        const decodedReturnUrl = decodeURIComponent(options.returnUrl || '');
        const cachedReturnUrl = decodedReturnUrl || ks.getStorageSync(RETURN_URL_STORAGE_KEY) || '';

        if (decodedReturnUrl) {
            ks.setStorageSync(RETURN_URL_STORAGE_KEY, decodedReturnUrl);
        }

        this.setData({
            orderId: orderId || '',
            returnUrl: cachedReturnUrl,
            openid: decodeURIComponent(options.openid || ''),
            productId: decodeURIComponent(options.productId || 'test_product_real'),
            quantity: Number(options.quantity || 1),
            totalAmount: Number(options.totalAmount || 1),
            subject: decodeURIComponent(options.subject || '支付订单'),
            body: decodeURIComponent(options.body || '完成当前内容解锁支付')
        });

        // 当前仅支持微信支付，直接初始化固定渠道
        this.initPaymentList();

        this.setData({
            amount: (Number(options.totalAmount || 1) / 100).toFixed(2),
            productName: decodeURIComponent(options.subject || '确认支付')
        });

        // 如果缺少支付参数，尝试从后端获取
        if (orderId && (!appId || !prepayId)) {
            console.log('[pay page DEBUG] Missing appId or prepayId, fetching from backend');
            this.fetchOrderAndPay(orderId);
            return;
        }

        if (orderId && appId && prepayId) {
            console.log('[pay page DEBUG] All payment parameters present, storing for later use');
            this.setData({
                paymentParams: {
                    appId,
                    prepayId,
                    nonceStr,
                    timeStamp,
                    sign
                }
            });
        }
    },

    onShow: function () {
        const pendingOrderId = this.data.orderId || ks.getStorageSync('pending_payment_order_id');
        if (pendingOrderId) {
            console.log('[pay page DEBUG] onShow detected pending payment order:', pendingOrderId);
            this.checkOrderStatusWithRetry(pendingOrderId, 8, 2000);
        }
    },

    onUnload: function () {
        this.clearOrderStatusPolling();
        this.clearPaymentTimeout();
    },

    // 初始化支付方式（当前仅支持微信支付）
    initPaymentList: function () {
        console.log('[pay page DEBUG] Initializing payment channel...');

        const fixedPaymentChannel = {
            provider: 'WECHAT',
            provider_channel_type: 'NORMAL'
        };
        console.log('[pay page DEBUG] Using fixed payment channel (WECHAT):', fixedPaymentChannel);
        this.setData({
            paymentChannel: fixedPaymentChannel,
            paymentListInitialized: true,
            showPaymentList: false
        });

        console.log('[pay page DEBUG] Fixed payment channel ready for confirmation');
    },

    getSelectedPaymentChannel: function () {
        const channel = this.data.paymentChannel || {
            provider: 'WECHAT',
            provider_channel_type: 'NORMAL'
        };

        return {
            provider: channel.provider,
            provider_channel_type: channel.provider_channel_type || 'NORMAL'
        };
    },

    isCurrentOrderMatchingChannel: function (paymentChannel) {
        const orderChannel = this.data.orderChannel;
        if (!orderChannel || !paymentChannel) return false;
        return orderChannel.provider === paymentChannel.provider &&
            orderChannel.provider_channel_type === paymentChannel.provider_channel_type;
    },

    clearPaymentTimeout: function () {
        if (this.paymentTimeout) {
            clearTimeout(this.paymentTimeout);
            this.paymentTimeout = null;
        }
    },

    clearOrderStatusPolling: function () {
        if (this.orderStatusPollTimer) {
            clearTimeout(this.orderStatusPollTimer);
            this.orderStatusPollTimer = null;
        }
    },

    createOrderForSelectedChannel: function (autoStart = true) {
        const paymentChannel = this.getSelectedPaymentChannel();
        if (!this.data.openid) {
            this.setData({
                paying: false,
                errorMsg: '缺少 openid，请重新进入支付页'
            });
            return;
        }

        const orderData = {
            user_id: this.data.openid,
            openid: this.data.openid,
            product_id: this.data.productId,
            quantity: this.data.quantity,
            total_amount: this.data.totalAmount,
            subject: this.data.subject,
            body: this.data.body,
            provider: paymentChannel
        };

        console.log('[pay page DEBUG] Creating order for selected channel:', orderData);
        this.setData({ paying: true, errorMsg: '' });

        api.order.create(orderData)
            .then((res) => {
                console.log('[pay page DEBUG] create order response:', res);
                if (res.statusCode === 200 && res.data && res.data.success && res.data.data && res.data.data.order_id) {
                    const orderId = res.data.data.order_id;
                    this.setData({
                        orderId,
                        orderChannel: paymentChannel
                    });
                    this.fetchOrderAndPay(orderId, autoStart);
                    return;
                }

                this.setData({
                    paying: false,
                    errorMsg: '创建订单失败：' + (res.data?.message || '未知错误')
                });
            })
            .catch((err) => {
                console.error('[pay page ERROR] create order failed:', err);
                this.setData({
                    paying: false,
                    errorMsg: '创建订单失败，请重试'
                });
            });
    },

    checkOrderStatusWithRetry: function (orderId, attempts = 8, delay = 2000) {
        if (!orderId) return;
        this.clearOrderStatusPolling();

        const poll = (remaining) => {
            api.order.query(orderId)
                .then((res) => {
                    const status = res.data?.data?.status;
                    console.log('[pay page DEBUG] order query status:', orderId, status, res.data);

                    if (status === 'paid') {
                        ks.removeStorageSync('pending_payment_order_id');
                        this.setData({
                            awaitingPaymentResult: false,
                            paying: false
                        });
                        this.handlePaymentSuccess({ skipNotify: true });
                        return;
                    }

                    if (remaining > 1 && this.data.awaitingPaymentResult) {
                        this.orderStatusPollTimer = setTimeout(() => poll(remaining - 1), delay);
                        return;
                    }

                    if (this.data.awaitingPaymentResult) {
                        this.setData({
                            paying: false,
                            awaitingPaymentResult: false,
                            errorMsg: '支付结果确认中，请稍后返回重试查询'
                        });
                    }
                })
                .catch((err) => {
                    console.error('[pay page ERROR] order query failed:', err);
                    if (remaining > 1 && this.data.awaitingPaymentResult) {
                        this.orderStatusPollTimer = setTimeout(() => poll(remaining - 1), delay);
                    }
                });
        };

        this.setData({ awaitingPaymentResult: true });
        poll(attempts);
    },

    // 用户选择支付渠道（通过bindchange事件）
    onPaymentSelect: function (e) {
        console.log('[pay page DEBUG] Payment selected via bindchange:', e);
        const paymentChannel = e.detail;
        
        if (paymentChannel && paymentChannel.provider) {
            console.log('[pay page DEBUG] Got payment channel from component:', paymentChannel);
            this.setData({
                paymentChannel: paymentChannel,
                showPaymentList: false // 隐藏组件
            });
            
            // 更新支付渠道信息显示
            const providerName = paymentChannel.provider === 'WECHAT' ? '微信支付' : 
                               paymentChannel.provider === 'ALIPAY' ? '支付宝' : 
                               paymentChannel.provider;
            console.log('[pay page DEBUG] Payment channel updated to:', providerName, 'ready for user confirmation');
        } else {
            console.error('[pay page ERROR] Invalid payment channel from component:', paymentChannel);
        }
    },

    // 用户点击确认支付按钮
    startPaymentWithParams: function () {
        console.log('[pay page DEBUG] startPaymentWithParams called');
        
        if (this.data.paying) {
            console.log('[pay page DEBUG] Already paying, ignoring');
            return;
        }
        
        const paymentChannel = this.getSelectedPaymentChannel();

        if (!this.data.orderId || !this.data.paymentParams || !this.isCurrentOrderMatchingChannel(paymentChannel)) {
            console.log('[pay page DEBUG] Creating or recreating order for selected channel:', paymentChannel);
            this.createOrderForSelectedChannel(true);
            return;
        }

        console.log('[pay page DEBUG] Using stored payment params:', this.data.paymentParams);
        this.startPayment(this.data.paymentParams);
    },

    fetchOrderAndPay: function (orderId, autoStart = false) {
        console.log('[pay page DEBUG] fetchOrderAndPay called with orderId:', orderId);
        this.setData({ paying: true, errorMsg: '' });
        
        // 使用统一的API服务
        api.pay.check(orderId)
            .then(res => {
                console.log('[pay page DEBUG] API response:', res);
                console.log('[pay page DEBUG] API response data:', JSON.stringify(res.data));
                
                // 支持多种API响应格式
                let paymentData = null;
                
                if (res.statusCode === 200) {
                    // 格式1: {success: true, data: {prepayId: ..., order_info_token: ...}}
                    if (res.data.success && res.data.data) {
                        paymentData = res.data.data;
                        console.log('[pay page DEBUG] Format 1 detected (success/data)');
                    }
                    // 格式2: 直接返回支付数据 {order_info_token: ..., order_no: ...}
                    else if (res.data.order_info_token || res.data.prepayId) {
                        paymentData = res.data;
                        console.log('[pay page DEBUG] Format 2 detected (direct payment data)');
                    }
                    // 格式3: 其他可能的格式
                    else if (res.data) {
                        paymentData = res.data;
                        console.log('[pay page DEBUG] Format 3 detected (raw data)');
                    }
                }
                
                if (paymentData) {
                    console.log('[pay page DEBUG] Payment parameters received from backend:', paymentData);
                    
                    // 更新金额和商品名称显示
                    // 注意：后端返回的amount是分，需要转换为元
                    const amountInYuan = paymentData.amount ? (paymentData.amount / 100).toFixed(2) : '0.01';
                    const productName =
                        paymentData.subject ||
                        paymentData.productName ||
                        this.data.subject ||
                        '确认支付';
                    
                    console.log('[pay page DEBUG] Amount conversion:', {
                        originalAmount: paymentData.amount,
                        amountInYuan: amountInYuan,
                        productName: productName
                    });
                    
                    this.setData({
                        amount: amountInYuan,
                        productName: productName
                    });
                    
                    // 总是等待用户点击确认支付按钮，不要自动开始支付
                    console.log('[pay page DEBUG] Storing payment parameters, waiting for user confirmation');
                    this.setData({
                        paymentParams: paymentData,
                        orderChannel: this.getSelectedPaymentChannel(),
                        paying: false // 停止loading，显示支付按钮
                    }, () => {
                        if (autoStart) {
                            this.startPayment(paymentData);
                        }
                    });
                    
                    // 记录支付参数（脱敏处理）
                    const safePaymentData = {
                        ...paymentData,
                        order_info_token: paymentData.order_info_token ? 
                            '***' + paymentData.order_info_token.slice(-10) : 'empty'
                    };
                    console.log('[pay page DEBUG] Payment parameters ready:', safePaymentData);
                } else {
                    console.error('[pay page ERROR] Invalid API response:', res);
                    console.error('[pay page ERROR] Response statusCode:', res.statusCode);
                    console.error('[pay page ERROR] Response data:', res.data);
                    this.setData({
                        paying: false,
                        errorMsg: '获取支付参数失败：' + (res.data?.message || '未知错误')
                    });
                }
            })
            .catch(err => {
                console.error('[pay page] fetch order failed:', err);
                this.setData({
                    paying: false,
                    errorMsg: '网络错误，请重试'
                });
            });
    },

    startPayment: function (orderInfo) {
        console.log('[pay page DEBUG] === startPayment ENTERED ===');
        console.log('[pay page DEBUG] Current paying state:', this.data.paying);
        
        if (this.data.paying) {
            console.log('[pay page DEBUG] Already paying, returning early');
            return;
        }
        
        this.setData({ paying: true, errorMsg: '' });
        console.log('[pay page DEBUG] Set paying to true');

        console.log('[pay page DEBUG] startPayment called with orderInfo:', JSON.stringify(orderInfo));

        // 检查是否为真实支付模式
        // 真实支付模式应该包含有效的order_info_token
        const isRealMode = orderInfo.order_info_token && 
                          orderInfo.order_info_token !== '' && 
                          !orderInfo.order_info_token.startsWith('test_');
        
        console.log('[pay page DEBUG] Is real mode:', isRealMode);
        console.log('[pay page DEBUG] order_info_token present:', !!orderInfo.order_info_token);
        console.log('[pay page DEBUG] order_info_token value:', orderInfo.order_info_token);
        
        // 根据快手小程序文档，ks.pay需要order_no和order_info_token
        // 后端API返回的字段应该是order_no和order_info_token
        // 对于旧格式的参数（appId、prepayId等），我们需要转换为新格式
        let order_no = orderInfo.order_no || this.data.orderId;
        let order_info_token = orderInfo.order_info_token || '';
        
        // 检查是否是旧格式的参数（appId、prepayId等）
        const isOldFormat = orderInfo.appId && orderInfo.prepayId && !orderInfo.order_info_token;
        if (isOldFormat) {
            console.log('[pay page DEBUG] Old format detected (appId/prepayId), converting to new format');
            // 对于旧格式，我们使用测试参数
            order_info_token = 'test_order_info_token_' + Date.now();
        }
        
        // 如果是模拟模式且没有order_info_token，使用测试参数
        if (!isRealMode && !order_info_token) {
            console.log('[pay page DEBUG] Mock mode detected, using test parameters');
            // 对于测试环境，使用测试的order_info_token
            order_info_token = 'test_order_info_token_' + Date.now();
        }
        
        console.log('[pay page DEBUG] order_no:', order_no);
        console.log('[pay page DEBUG] order_info_token:', order_info_token);
        
        // 检查支付参数是否有效
        if (!order_no) {
            console.error('[pay page ERROR] Missing order_no');
            this.setData({
                paying: false,
                errorMsg: '订单号缺失，请检查订单信息'
            });
            return;
        }
        
        // 构建支付参数
        const payParams = {
            serviceId: '1',
            orderInfo: {
                order_no: order_no,
                order_info_token: order_info_token
            }
        };

        const paymentChannel = this.getSelectedPaymentChannel();
        console.log('[pay page DEBUG] Using selected paymentChannel:', paymentChannel);
        payParams.paymentChannel = paymentChannel;
        
        // 记录支付渠道信息
        console.log('[pay page DEBUG] Payment channel set to:', {
            ...paymentChannel,
            note: '支付渠道必须与预下单时保持一致'
        });

        console.log('[pay page DEBUG] Final ks.pay params:', payParams);

        const createPayOptions = (extraOptions = {}) => ({
            serviceId: payParams.serviceId,
            orderInfo: payParams.orderInfo,
            paymentChannel: payParams.paymentChannel,
            ...extraOptions,
            success: (res2) => {
                ks.removeStorageSync('pending_payment_order_id');
                this.setData({ awaitingPaymentResult: false });
                console.log('[pay page] Payment success:', res2);
                this.handlePaymentSuccess();
            },
            fail: (err2) => {
                ks.removeStorageSync('pending_payment_order_id');
                console.error('[pay page] Payment fail:', err2);
                console.error('[pay page] Payment fail details:', JSON.stringify(err2));
                console.error('[pay page] Payment fail errMsg:', err2.errMsg);
                console.error('[pay page] Payment fail errorCode:', err2.errorCode);
                console.error('[pay page] Payment fail error:', err2.error);

                this.setData({
                    paying: false,
                    awaitingPaymentResult: false,
                    errorMsg: err2.errMsg || '支付未完成'
                });
                // 3秒后自动返回
                setTimeout(() => {
                    this.goBack();
                }, 3000);
            }
        });

        const logPayOptions = (options) => {
            console.log('[pay page DEBUG] Payment params sent to ks.pay:', {
                serviceId: options.serviceId,
                orderInfo: {
                    order_no: options.orderInfo.order_no,
                    order_info_token: options.orderInfo.order_info_token ? '***' + options.orderInfo.order_info_token.slice(-10) : 'empty'
                },
                paymentChannel: options.paymentChannel,
                payType: options.payType || 'not-set'
            });
        };

        const invokePay = (options, description) => {
            console.log(`[pay page DEBUG] Calling ks.pay (${description}) with params:`, options);
            ks.setStorageSync('pending_payment_order_id', this.data.orderId);
            this.setData({ awaitingPaymentResult: true });
            ks.pay(options);
            console.log('[pay page DEBUG] ks.pay called, waiting for callback...');
            logPayOptions(options);
        };

        const primaryPayOptions = createPayOptions();

        try {
            invokePay(primaryPayOptions, 'without payType');
        } catch (err) {
            const syncMessage = err && err.message ? err.message : String(err);
            console.error('[pay page ERROR] ks.pay threw synchronously:', syncMessage);

            if (syncMessage.includes('payType') && syncMessage.includes('缺失')) {
                const fallbackPayOptions = createPayOptions({ payType: 'IAPPurchase' });
                console.log('[pay page DEBUG] Retrying ks.pay with payType fallback for current devtools/runtime');
                invokePay(fallbackPayOptions, 'with payType fallback');
            } else {
                ks.removeStorageSync('pending_payment_order_id');
                this.setData({
                    paying: false,
                    awaitingPaymentResult: false,
                    errorMsg: syncMessage || '支付调用失败'
                });
            }
        }
    },

    // 模拟支付（用于开发环境）
    simulatePayment: function (payParams) {
        console.log('[pay page DEBUG] Simulating payment with params:', payParams);
        
        // 模拟支付延迟
        setTimeout(() => {
            console.log('[pay page DEBUG] Simulated payment success');
            
            // 显示成功提示
            ks.showToast({
                title: '模拟支付成功',
                icon: 'success',
                duration: 1500
            });
            
            // 模拟支付成功回调
            setTimeout(() => {
                this.handlePaymentSuccess();
            }, 1500);
        }, 2000);
    },

    handlePaymentSuccess: function (options = {}) {
        const { skipNotify = false } = options;
        ks.removeStorageSync('pending_payment_order_id');
        this.clearOrderStatusPolling();

        // 支付成功，通知后端确认订单
        const orderId = this.data.orderId;
        if (orderId && !skipNotify) {
            // 使用统一的API服务
            api.pay.notify(orderId, 'SUCCESS')
                .catch(() => {
                    // 静默失败，不干扰用户
                    console.log('[pay page] 支付结果通知失败，但不影响用户');
                });
        }

        // 显示成功提示后返回
        ks.showToast({
            title: '支付成功',
            icon: 'success',
            duration: 1500
        });

        setTimeout(() => {
            this.goBack();
        }, 1500);
    },

    getReturnTarget: function () {
        const returnUrl = this.data.returnUrl || ks.getStorageSync(RETURN_URL_STORAGE_KEY) || '';
        if (!returnUrl) return null;

        try {
            const parsed = new URL(returnUrl);
            if (parsed.origin !== 'https://letmetryai.cn') {
                return null;
            }
            return `${parsed.pathname.replace(/^\//, '')}${parsed.search}${parsed.hash}`;
        } catch (err) {
            console.error('[pay page ERROR] Invalid returnUrl:', returnUrl, err);
            return null;
        }
    },

    goBack: function () {
        const returnTarget = this.getReturnTarget();
        if (returnTarget) {
            console.log('[pay page DEBUG] Redirecting back to H5 via rewardedWebview:', returnTarget);
            ks.redirectTo({
                url: `/pages/rewardedWebview/rewardedWebview?target=${encodeURIComponent(returnTarget)}`
            });
            return;
        }

        // 返回上一页（webview）
        const pages = getCurrentPages();
        if (pages.length > 1) {
            ks.navigateBack();
        } else {
            // 如果没有上一页，跳转到首页
            ks.redirectTo({
                url: '/pages/index/index'
            });
        }
    },

    onRetry: function () {
        this.setData({ errorMsg: '', paying: false });
        // 重新获取订单信息
        if (this.data.orderId) {
            this.fetchOrderAndPay(this.data.orderId);
        }
    }
})
