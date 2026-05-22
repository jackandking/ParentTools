// pages/pay/pay.js
// 快手支付中转页 - 调起 ks.pay 完成支付

Page({
    data: {
        paying: false,
        orderId: '',
        errorMsg: ''
    },

    onLoad: function (options) {
        console.log('[pay page] onLoad:', options);

        const {
            orderId,
            appId,
            prepayId,
            nonceStr,
            timeStamp,
            sign,
            returnUrl
        } = options;

        if (!orderId) {
            this.setData({ errorMsg: '缺少订单号' });
            return;
        }

        this.setData({
            orderId,
            returnUrl: decodeURIComponent(returnUrl || '')
        });

        // 如果缺少支付参数，尝试从后端获取
        if (!appId || !prepayId) {
            this.fetchOrderAndPay(orderId);
            return;
        }

        // 自动调起支付
        this.startPayment({
            appId,
            prepayId,
            nonceStr,
            timeStamp,
            sign
        });
    },

    fetchOrderAndPay: function (orderId) {
        this.setData({ paying: true, errorMsg: '' });
        fetch('https://letmetry.cloud/api/pay/check-paid?orderId=' + encodeURIComponent(orderId))
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data && data.data.prepayId) {
                    this.startPayment(data.data);
                } else {
                    this.setData({
                        paying: false,
                        errorMsg: '获取支付参数失败'
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
        if (this.data.paying) return;
        this.setData({ paying: true, errorMsg: '' });

        console.log('[pay page] Starting ks.pay:', orderInfo);

        ks.pay({
            orderInfo: {
                appId: orderInfo.appId,
                prepayId: orderInfo.prepayId,
                nonceStr: orderInfo.nonceStr,
                timeStamp: orderInfo.timeStamp,
                sign: orderInfo.sign
            },
            success: (res) => {
                console.log('[pay page] Payment success:', res);
                this.handlePaymentSuccess();
            },
            fail: (err) => {
                console.error('[pay page] Payment fail:', err);
                this.setData({
                    paying: false,
                    errorMsg: err.errMsg || '支付未完成'
                });
                // 3秒后自动返回
                setTimeout(() => {
                    this.goBack();
                }, 3000);
            }
        });
    },

    handlePaymentSuccess: function () {
        // 支付成功，通知后端确认订单
        const orderId = this.data.orderId;
        if (orderId) {
            fetch('https://letmetry.cloud/api/pay/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    out_order_no: orderId,
                    result: 'SUCCESS'
                })
            }).catch(() => {});
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

    goBack: function () {
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
    }
})
