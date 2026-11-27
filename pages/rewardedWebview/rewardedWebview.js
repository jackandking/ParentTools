const AD_CONFIG = {
    rewarded: {
        type: 100011056,
        unitId: 100180751,
    },
    baseUrl: 'https://letmetryai.cn/'
};

const OPENID_STORAGE_KEY = 'kuaishou_openid';

Page({
    data: {
        webviewUrl: ''
    },
    onLoad: async function (options) {
        console.log(options);
        const target = options.target;
        console.log('rewardedWebview target:', target);

        // 显示分享按钮
        ks.showShareMenu();

        if (options.flow === 'rewarded') {
            this.showRewardedVideo(target);
        } else {
            // paid=1 由 app.js 支付兜底透传，必须继续传给 H5 才能触发自动生图/展示已付费结果
            const extraParams = {};
            if (options.paid === '1') extraParams.paid = '1';
            // pl_from=share 透传给 H5 埋点，用来识别「分享带来的首次完成」
            if (options.pl_from) extraParams.pl_from = options.pl_from;
            const webviewUrl = await this.buildWebviewUrl(target, extraParams);
            this.setData({ webviewUrl });
            // 插屏广告已移除：onLoad 自动弹插屏被快手判「多次主动弹出广告」驳回（1.0.3）
        }
    },

    async buildWebviewUrl(target, extraParams = {}) {
        const url = new URL(target, AD_CONFIG.baseUrl);
        const openid = await this.getOrFetchOpenid();
        if (openid) {
            url.searchParams.set('openid', openid);
        }

        Object.entries(extraParams).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                url.searchParams.delete(key);
            } else {
                url.searchParams.set(key, String(value));
            }
        });

        return url.toString();
    },

    async getOrFetchOpenid() {
        try {
            const cached = ks.getStorageSync(OPENID_STORAGE_KEY);
            if (cached) {
                console.log('rewardedWebview cached openid found');
                return cached;
            }
        } catch (err) {
            console.log('rewardedWebview read cached openid failed', err);
        }

        try {
            const loginRes = await new Promise((resolve, reject) => {
                ks.login({
                    success: resolve,
                    fail: reject
                });
            });

            const code = loginRes && loginRes.code;
            if (!code) {
                return '';
            }

            const response = await new Promise((resolve, reject) => {
                ks.request({
                    url: 'https://letmetry.cn/api/user/openid',
                    method: 'POST',
                    data: { code },
                    success: resolve,
                    fail: reject
                });
            });

            const openid = response?.data?.data?.openid || response?.data?.openid || '';
            if (openid) {
                ks.setStorageSync(OPENID_STORAGE_KEY, openid);
                console.log('rewardedWebview fetched openid success');
            }
            return openid;
        } catch (err) {
            console.log('rewardedWebview fetch openid failed', err);
            return '';
        }
    },

    showRewardedVideo(target) {
        const rewardedVideoAd = ks.createRewardedVideoAd({
            type: AD_CONFIG.rewarded.type,
            unitId: AD_CONFIG.rewarded.unitId,
        });

        rewardedVideoAd.onLoad(() => {
            console.log('onLoad event emit');
        });

        rewardedVideoAd.onError(({ errCode }) => {
            console.log('onError event emit', errCode);
            this.buildWebviewUrl(target, { finishedAd: false }).then((webviewUrl) => {
                this.setData({ webviewUrl });
            });
        });

        rewardedVideoAd.onClose(async ({ isEnded }) => {
            console.log('onClose event emit', isEnded);
            if (isEnded) {
                console.log('有人看完广告');
                const webviewUrl = await this.buildWebviewUrl(target, { finishedAd: true });
                this.setData({ webviewUrl });
            } else {
                console.log('有人没看完广告');
                const webviewUrl = await this.buildWebviewUrl(target, { finishedAd: false });
                this.setData({ webviewUrl });
            }
        });

        rewardedVideoAd.show()
            .catch(() => {
                rewardedVideoAd.load()
                    .then(() => rewardedVideoAd.show())
                    .catch(err => {
                        console.log('激励视频广告显示失败', err);
                    });
            });
    },

    onShareAppMessage: function () {
        // 从当前 webview URL 反推出 target，让对方落到同一个工具页，而不是通用首页
        let target = 'parent-tools/minority-card';
        const current = this.data.webviewUrl || '';
        const match = current.match(/[?&]target=([^&]+)/);
        if (match) {
            try {
                target = decodeURIComponent(match[1]);
            } catch (error) {
                target = 'parent-tools/minority-card';
            }
        }
        return {
            title: '家长爱 · 只有少数家长这么选',
            path: '/pages/rewardedWebview/rewardedWebview?target=' +
                encodeURIComponent(target) + '&pl_from=share'
        };
    }
});
