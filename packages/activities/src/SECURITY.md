# T22 活动安全约定

## web

初始地址必须是不含账号密码的 HTTP(S) 独立 origin。
嵌入前以 CORS HEAD、`redirect: error`、`credentials: omit`、`no-referrer`
检查最终响应 origin；缺失 CORS/HEAD 支持、来源变化、重定向或超时都会显示可结束的错误状态。
网页服务器需要允许播放端的 HEAD 检查来源。

iframe 始终使用 `sandbox="allow-scripts"`，不授予 allow-same-origin、
顶层导航、弹窗、表单、下载、相机、麦克风或定位能力。
iframe 最终 origin 为 opaque origin，完成事件的 `event.origin` 必须等于 `"null"`，
同时检查 `event.source === 当前 iframe.contentWindow` 与本次随机 nonce。
预检和实际导航之间即使服务器响应变化，opaque sandbox 仍保护宿主 DOM/存储；
浏览器不能直接读取跨来源 iframe 最终 URL，此措施不是远程页面代码审查。

宿主向网页 URL 添加 `sproutNonce` 和 `sproutParentOrigin` 参数。
网页主动完成时发送：

```js
const params = new URL(location.href).searchParams;
parent.postMessage(
  { type: 'sprout:complete', nonce: params.get('sproutNonce') },
  params.get('sproutParentOrigin'),
);
```

参数仅用于本次 iframe 的完成桥接，不是家庭 API 凭据。
暂停会移除网页；恢复或重试重新预检并轮换 nonce，旧窗口与旧 nonce 均无效。
旧的无 nonce 消息不再接受，开发 web fixture 和已有外部 H5 需要同步协议。

## video / sort

video 的 src、poster、captions 在写 DOM 与收集预加载时都校验，
只允许包内路径或资源解析器对应服务器的同源 URL；不自动播放。
非法 src 不创建 video，提供结束按钮；非法 poster/captions 直接忽略。

sort 的 color 仅接受 3/4/6/8 位 hex、范围合法的 rgb/rgba 和明确的具名颜色白名单。
拒绝 url、var、继承值、分号及其它 CSS token；非法值回退宿主强调色。
