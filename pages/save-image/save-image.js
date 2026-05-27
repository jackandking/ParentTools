Page({
    data: {
        imageUrl: '',
        returnUrl: '',
        saving: false,
        saved: false,
        errorMsg: ''
    },

    onLoad(options) {
        this.setData({
            imageUrl: decodeURIComponent(options.imageUrl || ''),
            returnUrl: decodeURIComponent(options.returnUrl || '')
        }, () => {
            if (this.data.imageUrl) {
                this.saveImage();
            } else {
                this.setData({ errorMsg: '缺少图片地址，请返回重试' });
            }
        });
    },

    async saveImage() {
        if (!this.data.imageUrl || this.data.saving) {
            return;
        }

        this.setData({
            saving: true,
            saved: false,
            errorMsg: ''
        });

        try {
            const downloadRes = await new Promise((resolve, reject) => {
                ks.downloadFile({
                    url: this.data.imageUrl,
                    success: resolve,
                    fail: reject
                });
            });

            const filePath = downloadRes.tempFilePath || downloadRes.apFilePath || downloadRes.filePath;
            if (!filePath) {
                throw new Error('未获取到本地图片路径');
            }

            await new Promise((resolve, reject) => {
                ks.saveImageToPhotosAlbum({
                    filePath,
                    success: resolve,
                    fail: reject
                });
            });

            this.setData({
                saving: false,
                saved: true
            });

            ks.showToast({
                title: '已保存到相册',
                icon: 'success',
                duration: 1200
            });

            setTimeout(() => {
                this.goBack();
            }, 1200);
        } catch (err) {
            const message = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : '保存失败';
            this.setData({
                saving: false,
                saved: false,
                errorMsg: message
            });
        }
    },

    previewImage() {
        if (!this.data.imageUrl) {
            return;
        }

        ks.previewImage({
            urls: [this.data.imageUrl],
            current: this.data.imageUrl
        });
    },

    openSetting() {
        ks.openSetting();
    },

    getReturnTarget() {
        const returnUrl = this.data.returnUrl;
        if (!returnUrl) return null;

        try {
            const parsed = new URL(returnUrl);
            if (parsed.origin !== 'https://letmetryai.cn') {
                return null;
            }
            return `${parsed.pathname.replace(/^\//, '')}${parsed.search}${parsed.hash}`;
        } catch (err) {
            console.error('[save image] Invalid returnUrl:', returnUrl, err);
            return null;
        }
    },

    goBack() {
        const returnTarget = this.getReturnTarget();
        if (returnTarget) {
            ks.redirectTo({
                url: `/pages/rewardedWebview/rewardedWebview?target=${encodeURIComponent(returnTarget)}`
            });
            return;
        }

        const pages = getCurrentPages();
        if (pages.length > 1) {
            ks.navigateBack();
        } else {
            ks.redirectTo({
                url: '/pages/index/index'
            });
        }
    }
});
