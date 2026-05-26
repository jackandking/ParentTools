const AD_CONFIG = {
    rewarded: {
        type: 100011056,
        unitId: 100180751,
    },
    interstitial: {
        type: 100033847,
        unitId: 100180752,
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
            const webviewUrl = await this.buildWebviewUrl(target);
            this.setData({ webviewUrl });

            if (options.showAd === 'true') {
                this.showInterstitialAd();
            }
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
                    url: 'https://letmetry.cloud/api/user/openid',
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

    showInterstitialAd() {
        const interstitialAd = ks.createInterstitialAd({
            type: AD_CONFIG.interstitial.type,
            unitId: AD_CONFIG.interstitial.unitId,
        });

        interstitialAd.onLoad(() => {
            console.log('插屏广告已加载');
            interstitialAd.show().catch(err => {
                console.log('插屏广告展示失败', err);
            });
        });

        interstitialAd.onError((res) => {
            console.log('插屏广告出错', res);
        });

        interstitialAd.onClose(() => {
            console.log('插屏广告已关闭');
        });

        interstitialAd.load().catch(err => {
            console.log('插屏广告加载失败', err);
        });
    },

    onShareAppMessage: function () {
        return {
            title: '家长爱',
            path: '/pages/rewardedWebview/rewardedWebview'
        };
    }
});
