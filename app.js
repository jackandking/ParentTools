// app.js
// 支付兜底：外部支付（微信 App）完成后，快手平台偶发未把用户带回小程序页面，
// 或 ks.pay success 回调未触发导致 pending 订单悬挂。
// 启动/回前台时用 storage 里的 pending 订单查后端 source of truth，
// 已支付则自动跳回结果页，确保用户（及审核录屏）能看到支付效果。

const PAY_API_BASE = 'https://letmetry.cn';
const PENDING_ORDER_KEY = 'pending_payment_order_id';
const RETURN_URL_KEY = 'pending_payment_return_url';
const PENDING_AT_KEY = 'pending_payment_started_at';
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

App({
  onLaunch: function () {},

  onShow: function () {
    // 延迟到首个页面加载完成再跳，避免 onShow 早于页面 onLoad 导致 redirectTo 失败
    const self = this;
    setTimeout(function () { self.checkPendingPayment(); }, 800);
  },

  checkPendingPayment: function () {
    if (this._checkingPending) return;

    let orderId = '';
    try { orderId = ks.getStorageSync(PENDING_ORDER_KEY) || ''; } catch (e) { return; }
    if (!orderId) return;

    // 过期订单直接丢弃（避免几天前的悬挂单反复查/误跳）
    let startedAt = 0;
    try { startedAt = Number(ks.getStorageSync(PENDING_AT_KEY) || 0); } catch (e) {}
    if (startedAt && Date.now() - startedAt > PENDING_TTL_MS) {
      this.clearPending();
      return;
    }
    if (!startedAt) {
      try { ks.setStorageSync(PENDING_AT_KEY, Date.now()); } catch (e) {}
    }

    this._checkingPending = true;
    const self = this;
    ks.request({
      url: `${PAY_API_BASE}/api/order/query/${encodeURIComponent(orderId)}`,
      method: 'GET',
      success: function (res) {
        const payload = res && res.data;
        const status = payload && payload.data && payload.data.status;
        if (status === 'paid') {
          self.clearPending();
          let returnUrl = '';
          try { returnUrl = ks.getStorageSync(RETURN_URL_KEY) || ''; } catch (e) {}
          const target = self.parseReturnTarget(returnUrl);
          if (target) {
            console.log('[pay fallback] 检测到已支付订单，跳回结果页:', target);
            ks.redirectTo({
              // paid=1 必须透传到 H5：否则 H5 不触发生图，用户回到小程序只看到选省份页（11-22 真机反馈）
              url: `/pages/rewardedWebview/rewardedWebview?target=${encodeURIComponent(target)}&paid=1`,
              fail: function (err) { console.error('[pay fallback] redirectTo failed:', err); }
            });
          } else {
            console.log('[pay fallback] 已支付但无 returnUrl，停在当前页');
          }
        } else if (status === 'failed' || (payload && payload.success === false)) {
          self.clearPending();
        }
        // status === 'pending'：保留，下次 onShow 再查（后端回调可能还在路上）
      },
      fail: function (err) {
        console.error('[pay fallback] 订单查询失败，保留待下次重试:', err);
      },
      complete: function () {
        self._checkingPending = false;
      }
    });
  },

  clearPending: function () {
    try {
      ks.removeStorageSync(PENDING_ORDER_KEY);
      ks.removeStorageSync(PENDING_AT_KEY);
    } catch (e) {}
  },

  parseReturnTarget: function (returnUrl) {
    if (!returnUrl) return null;
    try {
      const parsed = new URL(returnUrl);
      if (parsed.origin !== 'https://letmetryai.cn') return null;
      return `${parsed.pathname.replace(/^\//, '')}${parsed.search}${parsed.hash}`;
    } catch (e) {
      console.error('[pay fallback] 无效 returnUrl:', returnUrl, e);
      return null;
    }
  }
})
