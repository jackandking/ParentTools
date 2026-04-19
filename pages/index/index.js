//index.js
Page({
  data: {
    motto: 'Hello World',
  },
  onLoad: function () {
    // 显示分享按钮
    ks.showShareMenu();
  },
  onShareAppMessage: function () {
    return {
      title: '家长爱',
      path: '/pages/index/index'
    }
  }
})
