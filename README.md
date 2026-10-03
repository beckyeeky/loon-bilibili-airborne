# Loon 哔哩哔哩空降助手（Beta）

面向官方 iOS/iPadOS 哔哩哔哩客户端的独立网络插件。八类别可分别开关；从 `bsbsb.top` 只读获取片段，把保留的空降标记加入原弹幕，使用远程 Chronos 模块触发自动跳转。

**未做真机验证，不能把离线通过视为播放器兼容性保证。** 采用 Loon 3.5.1 (998)+ 新 Script 语法；提供的 Loon/1005 UA 仅说明 Loon build，不代表哔哩哔哩版本或已验证命中。

## 安装（功能分支测试版）

- [插件原文](https://raw.githubusercontent.com/beckyeeky/loon-bilibili-airborne/feature/full-airborne/BilibiliAirborne.plugin)
- [导入 Loon](loon://import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fbeckyeeky%2Floon-bilibili-airborne%2Ffeature%2Ffull-airborne%2FBilibiliAirborne.plugin)

本版本位于 `feature/full-airborne`，不在 `main`。PR 合并前，请勿把安装路径自行改成 `main`。移动分支订阅会跟随更新；重现实验请使用提交 SHA 固定脚本 URL。需要自行检查更新差异。

1. 在 Loon 启用复写、脚本和 MitM，安装并信任 MitM 证书。
2. 导入插件，确认 `grpc.biliapi.net`、`app.bilibili.com` 已解密。
3. **先解决下节冲突**，完全退出并重启哔哩哔哩，重新打开视频。已有播放器模块/弹幕可能缓存。
4. 用已有社区标记的视频测试，确认同一 CID 有 `skip` 片段。默认只开赞助类别，不是所有视频都会跳转。
5. 无效时检查真实 URL、客户端版本、Chronos MD5、完整 gRPC Body 和模块请求；不要共享 Cookie/token 或原始鉴权头。

## 原去广告插件冲突：必须调整命中范围

官方 Script V2 文档说明，同一请求/响应最多选一条脚本，使用最终配置顺序中第一条完整匹配的规则。因此，仅关闭另一插件的「空降」开关**不能**解除其宽泛 Response Script 对 `ViewProgress` 的占用。

- 从其他响应脚本的匹配表达式移除 `ViewProgress`，例如把 `(View|ViewProgress|RelatesFeed|AIRelateAsync)` 改为 `(View|RelatesFeed|AIRelateAsync)`；同时检查 `view.v1` 和 `viewunite.v1` 两条路径。
- 或在该 Response Script 的条件增加 `&& !(${url} ~= /\/ViewProgress$/)`。必须保存后验证配置可加载。
- 禁用其他 `DmSegMobile` Request Script。本插件不合并两个请求脚本，不依赖插件顺序抢占。
- 不会删除 `video_guide`、`dm`、广告字段或 VIP 字段。若需要其他净化，请在互不重叠的接口完成。

## 参数与默认值

| 参数 | 默认 | 说明 |
|---|---:|---|
| enabled | 开 | 总开关 |
| sponsor | 开 | 赞助广告 |
| intro / outro | 关 | 开场 / 结尾 |
| preview | 关 | 预览或回顾 |
| selfpromo | 关 | 自我推广 |
| interaction | 关 | 点赞关注等互动提醒 |
| filler | 关 | 离题闲聊 |
| music_offtopic | 关 | 音乐视频的非音乐部分 |
| minDuration | 8 | 最短原始片段，秒；限制 0–3600 |
| offset | 2 | 起跳点相对片段起点偏移，秒；限制 -10–10。终点不偏移 |
| cacheTTL | 3600 | 秒；限制 60–86400 |
| cacheCapacity | 64 | BV/CID/类别组合数；限制 1–256 |

缓存键包含 BV、CID 和启用类别组合。存原始片段，因此改变最小时长或偏移立即重新计算；类别改变独立查询。404 作为空结果缓存，网络/解析/500 错误不缓存。缓存总序列化字符上限约 2 MiB；超限逐条淘汰。持久存储并非事务性，多请求并发可能覆盖彼此缓存，只影响命中率，不影响片段 CID 校验。只使用命名空间 `loon.airborne.v1.cache`，不清空其他脚本存储。

## 行为和边界

- 仅接受当前 CID、启用类别、`actionType=skip`、有限数字且非负、起点小于终点的片段；排序、去重并合并重叠；标记只注入其起跳点所属 360 秒弹幕分段。
- 保留 `content=空指部已就位`、`action=airborne:结束毫秒` 这组播放器契约。不改成任意文案；已有同终点 action 不重复注入。
- 原弹幕及其他 protobuf 字段保留原始字节。Chronos 仅替换字段 1 MD5、2 file，移除旧签名字段 3，保留其他字段。只识别明确的上游原模块 MD5；未知版本原样继续，不按 UA 猜测。
- protobuf 支持 wire 0、1、2、5；废弃 group、损坏 varint、越界长度安全 no-op。
- gRPC 解析支持多帧以及 `grpc-encoding:gzip`（通过 Loon `$utils.ungzip`）；改写输出为未压缩 identity 帧。ViewProgress 支持多帧；DmSegMobile 属于 unary，多个请求/响应消息不确定语义时原样继续。未知压缩、HTTP 层 Content-Encoding、超 4 MiB、超 64 帧均 no-op。
- 请求脚本先读片段，有可用片段才用原请求原 host/body/headers重新获取弹幕并返回模拟响应。该重请求携带原鉴权头，仅发往原哔哩哔哩 URL；片段服务只收到 BV/CID/类别和版本标识，不转发鉴权头。重请求失败则原请求继续，可能产生一次重复只读弹幕请求。
- 所有脚本路径只调用一次 `$done`，超时/异常原样继续；无日志输出、无片段提交、投票、账户写入、视频上传、去广告或权益修改。
- 只提供自动模式。现有远程模块基于固定标记自动 seek；没有验证可控制的手动协议，故不提供误导性的手动开关。弹幕关闭、客户端缓存、预加载、seek跨分段及平台签名检查均可能导致无效。

## 第三方模块与安全

本仓库 JS 是独立的小型 protobuf/gRPC 和空降逻辑，采用 MIT。协议审计材料、下载原脚本、运行日志和第三方 ZIP **不在仓库内**。

真正执行播放器跳转的是 [kokoryh/chronos](https://github.com/kokoryh/chronos)，不是 Loon 本身。其仓库 `LICENSE` 为 GPL-3.0，模块包元数据标识 The Danmaku Flame Master Authors © bilibili。我们不复制或再分发这些模块；仅把已识别版本的资源地址指向其固定提交 `69a8996b1f1311b606021e3f194b0390280ab618`。具体 MD5 与资源审计见 [协议与依赖说明](docs/PROTOCOL.md)。使用这些远程模块仍需考虑上游代码、资源的版权和许可，不把仓库级许可证解释为全部第三方图片可无限再分发。

**这会让客户端下载并执行第三方播放器模块。** 固定提交减少漂移，不等于安全审计或官方授权；MD5 是客户端资源标识，不是安全签名。移除签名后客户端是否接受必须真机验证。默认启用代表选择这条依赖链；不接受此风险请关闭总开关或不要安装。GitHub raw 无法访问或资源被删除时功能不可用。不做来源兜底，不动态下载 JS 到 Loon eval，不装第三方框架。

`bsbsb.top` 是社区只读片段服务，结果不是官方内容审核；服务会知道请求 BV/CID，HTTP 缓存及 TTL 会导致片段不是即时更新。

## 开发与验证

需要 Node.js 20+，无 npm 依赖：

```sh
npm test
# 或 node --test test/*.test.js
```

测试覆盖八类别、BV/CID、时长偏移、排序合并、缓存异常/TTL/容量、protobuf 未知字段、gRPC 多帧/gzip/坏帧、有界大小、模拟 Loon 成功/失败/一次 done、超时晚回调和 360 秒分段。GitHub Actions 对 PR 执行相同命令。

真机验收至少检查：998/1005 配置加载、iPhone/iPad 官方客户端 `ViewProgress` 模块字段与远程包请求、单 P/多 P CID 匹配、跨 360 秒边界、关闭弹幕、seek 回看、模块签名与缓存、开启原净化插件后接口排除、断网/服务 404/压缩回应下正常播放。当前均未完成。

语法核对来源：[Script V2](https://nsloon.app/docs/Script/script_v2)、[Script API](https://nsloon.app/docs/Script/script_api)、[Plugin](https://nsloon.app/docs/Plugin/)。本项目只使用官方文档明确的新 Script 形式，不把生成器输出或离线测试当作真机配置解析证明。
