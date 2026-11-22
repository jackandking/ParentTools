Page({
    data: {
        imageUrl: '',
        returnUrl: '',
        saving: false,
        saved: false,
        errorMsg: '',
        diagnostic: ''
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

        // v1.0.10 多策略修复：安卓 downloadFile 的 tempFilePath 无 .jpg 后缀 →
        // saveImageToPhotosAlbum 报 "decode image fail"。v1.0.9 用 ks.env.USER_DATA_PATH
        // 但那是小游戏 API，小程序 ks.env 常为 undefined → 修复静默失效。
        // 本版不猜 API：依次尝试多个带 .jpg 后缀的 filePath 候选，任一保存成功即止；
        // 全失败则降级预览长按（真机已验证可用）。并把诊断串外显便于定位。
        const ts = Date.now();
        const candidates = [];
        // 候选1：快手小程序已知用户目录协议 kwfile://usr（掘金踩坑纪要实证）
        candidates.push(`kwfile://usr/footprint-${ts}.jpg`);
        // 候选2：若平台暴露了 USER_DATA_PATH 则用之（兼容个别版本）
        const userDataPath = ks.env && ks.env.USER_DATA_PATH;
        if (userDataPath && userDataPath.indexOf('footprint') < 0) {
            candidates.push(`${userDataPath}/footprint-${ts}.jpg`);
        }
        // 候选3：不带协议的 usr 路径
        candidates.push(`usr/footprint-${ts}.jpg`);

        const attempts = [];
        let saved = false;
        let lastErr = '';

        for (let i = 0; i < candidates.length && !saved; i++) {
            const targetPath = candidates[i];
            try {
                const downloadRes = await new Promise((resolve, reject) => {
                    ks.downloadFile({
                        url: this.data.imageUrl,
                        filePath: targetPath,
                        success: resolve,
                        fail: reject
                    });
                });
                const fp = downloadRes.filePath || targetPath;
                attempts.push(`方案${i + 1}下载OK:${fp.slice(-32)}`);
                await new Promise((resolve, reject) => {
                    ks.saveImageToPhotosAlbum({ filePath: fp, success: resolve, fail: reject });
                });
                saved = true;
                attempts.push(`方案${i + 1}保存成功`);
                // 清理用户目录文件（失败不影响）
                try {
                    const fs = ks.getFileSystemManager();
                    if (fs && fs.unlink) fs.unlink(fp);
                } catch (e) {}
            } catch (err) {
                const m = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : '未知错误';
                lastErr = m;
                attempts.push(`方案${i + 1}失败:${String(m).slice(0, 45)}`);
            }
        }

        // 最后一搏：不指定 filePath 拿 tempFilePath（旧路径），万一是别的原因
        if (!saved) {
            try {
                const dRes = await new Promise((resolve, reject) => {
                    ks.downloadFile({ url: this.data.imageUrl, success: resolve, fail: reject });
                });
                const tp = dRes.tempFilePath || dRes.filePath;
                if (tp) {
                    await new Promise((resolve, reject) => {
                        ks.saveImageToPhotosAlbum({ filePath: tp, success: resolve, fail: reject });
                    });
                    saved = true;
                    attempts.push('兜底tempFilePath保存成功');
                }
            } catch (err) {
                lastErr = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : '未知错误';
                attempts.push(`兜底失败:${String(lastErr).slice(0, 45)}`);
            }
        }

        const diag = `env=${ks.env ? '有' : '无'}${userDataPath ? '/有UD' : ''} | ` + attempts.join(' ; ');
        console.log('[save image diag]', diag);
        this.setData({ diagnostic: diag });

        if (saved) {
            this.setData({ saving: false, saved: true });
            ks.showToast({ title: '已保存到相册', icon: 'success', duration: 1200 });
            setTimeout(() => { this.goBack(); }, 1200);
        } else {
            // 全部失败 → 自动打开预览让用户长按（真机已验证可用）
            this.setData({
                saving: false,
                saved: false,
                errorMsg: '自动保存未成功，已打开图片预览：长按图片 → 保存到相册'
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
