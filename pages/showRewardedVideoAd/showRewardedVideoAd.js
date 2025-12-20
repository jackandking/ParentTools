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
	onLoad: function (options) {
		console.log(options);
		let result_page_id = options.result_page_id;
		console.log('showRewardedVideoAd result_page_id:', result_page_id);

		this.showRewardedVideo(result_page_id);		
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
})