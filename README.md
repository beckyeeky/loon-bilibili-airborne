# Loon 哔哩哔哩八类别空降增强（Beta）

本插件采用**依赖模式**：仅增强 `DmSegMobile` 请求的弹幕注入；保留原去广告插件启用，由其 `ViewProgress` 响应处理 Chronos。八类别分别开关，默认仅赞助。未经真机验证，不保证所有客户端版本兼容。

## 安装与最小调整

- [功能分支插件原文](https://raw.githubusercontent.com/beckyeeky/loon-bilibili-airborne/feature/full-airborne/BilibiliAirborne.plugin)
- [导入 Loon](loon://import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fbeckyeeky%2Floon-bilibili-airborne%2Ffeature%2Ffull-airborne%2FBilibiliAirborne.plugin)

要求 Loon 3.5.1 (998)+、复写/脚本/MitM 开启，证书安装并信任；解密 `grpc.biliapi.net`、`app.bilibili.com`。

原去广告插件只做以下调整：

1. **保留 `sponsorBlock=true`（空降助手开关打开）**。原响应脚本靠此参数启用 Chronos 替换，不能关闭整个开关。
2. **仅禁用或删除匹配 `DmSegMobile` 的 request 行**。在已审计版本其 tag 为 `bilibili.airborne`，界面可能显示“空降助手”；以 URL 和阶段识别，不要凭名称删除整组。可把该行 `enable=${sponsorBlock}` 改成 `enable=false`，或删除该行。
3. **保留 ProtoBuf response 行**（已审计 tag 为 `bilibili.protobuf`），保留其中 `view.v1` 和 `viewunite.v1` 的 `ViewProgress` 匹配及传入的 `${sponsorBlock}`。
4. 启用本插件的请求注入。当前插件不注册自己的 ViewProgress response；不要再从原响应正则排除 ViewProgress。

Loon Script V2 同一请求/响应最多执行第一条完整匹配脚本，不是串行叠加所有脚本。规则最终排序和本地/插件优先级都会影响抢占；不能靠调整插件顺序确保两个重叠脚本合并。应使 `DmSegMobile` request 仅剩本插件一条有效规则，`ViewProgress` response 仅由原插件处理，同时检查本地配置和其他插件。

订阅更新可能覆盖对原插件的编辑，更新后重新检查。保存配置后更新本插件及远程脚本缓存，完全退出并重启哔哩哔哩，重新打开视频。客户端模块/弹幕缓存与 Loon 脚本缓存不同；没看到模块下载不能单独证明未处理。

## 参数

| 参数 | 默认 | 含义 |
|---|---:|---|
| enabled | 开 | 注入总开关；关闭不等于关闭原插件 Chronos |
| sponsor | 开 | 赞助 |
| intro / outro | 关 | 开场 / 结尾 |
| preview / selfpromo | 关 | 回顾预览 / 自我推广 |
| interaction / filler | 关 | 互动提醒 / 离题闲聊 |
| music_offtopic | 关 | 音乐视频非音乐部分 |
| minDuration | 8 | 原始片段最短秒数，0–3600 |
| offset | 2 | 起跳偏移秒数，-10–10；终点不偏移 |
| cacheTTL | 3600 | 片段缓存秒数，60–86400 |
| cacheCapacity | 64 | 缓存组合条目数，1–256 |
| diagnostics | 关 | 安全诊断：固定事件名与有界数量，无 URL、BV/CID、token、模块地址或原始异常 |

## 契约与边界

- 当前 CID、启用类别、`actionType=skip`、有效时间且达到最小时长才注入；排序、去重、合并重叠，仅注入起跳点所属 360 秒分段。
- 保留 `content=空指部已就位`、`action=airborne:结束毫秒`、mode=5、attr=1310724、type=1、dmFrom=1。Chronos 将结束毫秒除以 1000 后 seek。不能随意改文案。
- 正常显示空指弹幕只说明注入路径可能成功，**不证明修改版 Chronos 已加载或执行 seek**。审计资源还要求创建弹幕视图时 `currentTime <= progress`，迟到/预加载/回看可能影响触发。
- 只获取社区片段，不做提交/投票/账户写入。原鉴权头仅随重请求发往原哔哩哔哩 URL，不转发给片段服务。
- 原弹幕/未知 protobuf 字段保留；支持 wire 0/1/2/5，gRPC identity 与 gzip；未知压缩、HTTP Content-Encoding、坏帧、超 4 MiB 或超 64 帧 fail-open。DmSegMobile 多消息不改写。每次仅一次 `$done`。
- 命名空间 `loon.airborne.v1.cache` 缓存 BV/CID/类别的原始片段，404 负缓存，网络/500 不缓存；时长/偏移变化立即重算。并发可能降低缓存命中率，不改变 CID 校验；不清空其他脚本存储。
- 本插件不提供独立 Chronos 适配，也不提供手动模式。源码保留的 `chronos()` 仅供离线审计测试，运行入口不会调用。原插件已审计实现未知 MD5 按 UA 选择模块兜底，此行为由依赖负责，不等于全版本兼容保证。

## 排查“有弹幕但不跳转”

开启 diagnostics，从视频片段之前正常播放，不先拖动到片段内部，保持弹幕开启：

```text
[airborne diag-v1] request-matched
[airborne diag-v1] ranges count=1
[airborne diag-v1] injected count=1
```

只提供：Loon build、哔哩哔哩版本及普通/HD/国际版、这三类日志、原 ProtoBuf response 是否命中 ViewProgress、其 sponsorBlock 是否为 true、脱敏后的模块 MD5 与替换状态、模块 ZIP 请求状态/是否使用缓存、是否出现空指文字/图标及是否可点击跳转。不要提供原始请求 URL、观看 ID、鉴权头、token、Cookie 或完整抓包。

诊断没有输出时先查请求规则命中、总开关和脚本缓存；注入成功但无 seek 时先查依赖响应规则与模块加载，不能仅凭弹幕推断未知 MD5 或缓存故障。若需抓包，请本地仅提取 Chronos 字段编号、32 位十六进制 MD5、替换前后状态和 HTTP 状态，删除 file 查询参数、签名及其他字段。

## 许可与验证

本仓库原创 JS/测试采用 MIT；不复制或再分发第三方脚本和 ZIP。实际播放器跳转依赖 [kokoryh/chronos](https://github.com/kokoryh/chronos)，仓库 LICENSE 为 GPL-3.0，模块元数据标识 The Danmaku Flame Master Authors © bilibili。第三方许可和资源署名保留；仓库级许可不代表所有图片可再分发。启用依赖意味着接受第三方模块执行风险，MD5 不是安全签名。模块可达、签名被客户端接受和真机兼容仍待验证。

开发：Node.js 20+，`npm test`，无 npm 依赖。离线协议与资源记录见 [PROTOCOL](docs/PROTOCOL.md)、[VALIDATION](docs/VALIDATION.md)。功能分支 `feature/full-airborne` 不合 main；重现请固定提交 SHA 的脚本地址。参考 [官方 Script V2](https://nsloon.app/docs/Script/script_v2)。
