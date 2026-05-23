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

Page({
    data: {
        webviewUrl: ''
    },
    onLoad: function (options) {
        console.log(options);
        const target = options.target;
        console.log('rewardedWebview target:', target);

        // 显示分享按钮
        ks.showShareMenu();

        if (options.flow === 'rewarded') {
            this.showRewardedVideo(target);
        } else {
            this.setData({
                webviewUrl: `${AD_CONFIG.baseUrl}${target}`
            });

            if (options.showAd === 'true') {
                this.showInterstitialAd();
            }
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
            this.setData({
                webviewUrl: `${AD_CONFIG.baseUrl}${target}?finishedAd=false`
            });
        });

        rewardedVideoAd.onClose(({ isEnded }) => {
            console.log('onClose event emit', isEnded);
            if (isEnded) {
                console.log('有人看完广告');
                this.setData({
                    webviewUrl: `${AD_CONFIG.baseUrl}${target}?finishedAd=true`
                });
            } else {
                console.log('有人没看完广告');
                this.setData({
                    webviewUrl: `${AD_CONFIG.baseUrl}${target}?finishedAd=false`
                });
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
