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

        // 安卓已知坑（v1.0.9 修复）：downloadFile 用 tempFilePath 时扩展名是 unknown/无后缀，
        // saveImageToPhotosAlbum 无法解码 → "fail decode image fail:kwfile:///tmp/xxx"。
        // 正解：downloadFile 传 filePath 指定带 .jpg 后缀的本地用户路径（快手官方文档支持），
        // 保存时用返回的 res.filePath。服务端 /image/upload 把 PNG 压成 JPEG，故后缀为 .jpg。
        const userDataPath = ks.env && ks.env.USER_DATA_PATH;
        const localPath = userDataPath
            ? `${userDataPath}/footprint-${Date.now()}.jpg`
            : '';

        try {
            const downloadRes = await new Promise((resolve, reject) => {
                const opts = {
                    url: this.data.imageUrl,
                    success: resolve,
                    fail: reject
                };
                if (localPath) opts.filePath = localPath;
                ks.downloadFile(opts);
            });

            // 优先带后缀的 filePath；老平台无 USER_DATA_PATH 时才退回 tempFilePath
            const filePath = downloadRes.filePath || downloadRes.tempFilePath || downloadRes.apFilePath;
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

            // 用户目录文件不会自动清理，保存后删除（失败不影响主流程）
            if (localPath && filePath === localPath) {
                try {
                    const fs = ks.getFileSystemManager();
                    if (fs) fs.unlink(localPath);
                } catch (e) {
                    console.warn('[save image] cleanup skipped:', e);
                }
            }

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
            const rawMsg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : '';
            console.error('[save image] save failed:', rawMsg);
            // 降级：直接保存失败 → 自动打开预览让用户长按保存（真机已验证可用路径）
            this.setData({
                saving: false,
                saved: false,
                errorMsg: '直接保存未成功，已为你打开图片预览，长按图片即可存入相册'
            });
            this.previewImage();
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
