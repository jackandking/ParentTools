const AD_CONFIG = {
    baseUrl: 'https://letmetryai.cn/'
};

const API_BASE = 'https://letmetry.cloud';

Page({
    data: {
        webviewUrl: '',
        showPayBtn: false,
        openid: '',
        target: '',
        paying: false
    },

    onLoad: function (options) {
        console.log('[rewardedWebview] onLoad:', options);
        const target = options.target || '';
        const openid = options.openid || '';

        // 显示分享按钮
        ks.showShareMenu();

        // 判断是否是需要支付功能的页面
        const isPayPage = target.includes('child-travel-map') || target.includes('parent-type-test');

        this.setData({
            target: target,
            openid: openid,
            webviewUrl: `${AD_CONFIG.baseUrl}${target}`,
            showPayBtn: isPayPage
        });

        if (options.showAd === 'true') {
            this.showInterstitialAd();
        }
    },

    onPayTap: function () {
        if (this.data.paying) return;
        this.setData({ paying: true });
        this.createOrderAndPay();
    },

    async createOrderAndPay() {
        const { target, openid } = this.data;
        const productId = target.includes('child-travel-map') ? 'child-travel-map' : 'parent-type-test';
        const productName = target.includes('child-travel-map') ? '孩子足迹地图生成' : '测测你是哪种家长类型';
        const amount = 100;

        ks.showLoading({ title: '创建订单...' });

        try {
            const res = await this.request({
                url: `${API_BASE}/api/pay/create-order`,
                method: 'POST',
                header: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ openid, productId, productName, amount })
            });

            const data = JSON.parse(res.data);
            if (!data.success) {
                throw new Error(data.error || '创建订单失败');
            }

            const order = data.data;
            console.log('[pay] order created:', order.orderId);
            ks.hideLoading();

            // 调起快手支付
            ks.pay({
                orderInfo: {
                    appId: order.appId,
                    prepayId: order.prepayId,
                    nonceStr: order.nonceStr,
                    timeStamp: order.timeStamp,
                    sign: order.sign
                },
                success: (res) => {
                    console.log('[pay] success:', res);
                    this.handlePaySuccess(order.orderId);
                },
                fail: (err) => {
                    console.error('[pay] fail:', err);
                    ks.showToast({ title: '支付未完成', icon: 'none' });
                    this.setData({ paying: false });
                }
            });
        } catch (err) {
            console.error('[pay] error:', err);
            ks.hideLoading();
            ks.showToast({ title: '创建订单失败', icon: 'none' });
            this.setData({ paying: false });
        }
    },

    handlePaySuccess: function (orderId) {
        // 通知后端确认
        this.request({
            url: `${API_BASE}/api/pay/notify`,
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ out_order_no: orderId, result: 'SUCCESS' })
        }).catch(() => {});

        ks.showToast({ title: '支付成功', icon: 'success' });

        // 重新加载 webview，追加 ?paid=1
        const { webviewUrl } = this.data;
        const separator = webviewUrl.includes('?') ? '&' : '?';
        this.setData({
            webviewUrl: webviewUrl + separator + 'paid=1',
            paying: false
        });
    },

    request: function (options) {
        return new Promise((resolve, reject) => {
            const task = ks.request({
                ...options,
                success: resolve,
                fail: reject
            });
        });
    },

    showInterstitialAd: function () {
        const interstitialAd = ks.createInterstitialAd({
            type: 100033847,
            unitId: 100180752,
        });
        interstitialAd.onLoad(() => {
            interstitialAd.show().catch(err => {
                console.log('插屏广告展示失败', err);
            });
        });
        interstitialAd.onError((res) => {
            console.log('插屏广告出错', res);
        });
        interstitialAd.load().catch(err => {
            console.log('插屏广告加载失败', err);
        });
    },

    onMessage: function (event) {
        console.log('[rewardedWebview] onMessage:', event);
    },

    onShareAppMessage: function () {
        return {
            title: '家长爱',
            path: '/pages/rewardedWebview/rewardedWebview'
        };
    }
});
