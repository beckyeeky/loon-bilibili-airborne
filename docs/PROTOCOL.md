# 协议与依赖审计

## 字段最小集合

- `bilibili.community.service.dm.v1.DmSegMobileReq`：1 pid/AID（varint）、2 oid/CID、3 type（仅 1）、4 segment_index（1-based）、6 progress（varint，毫秒；用于剔除终点不晚于当前进度的片段）。不改原请求，未用字段保持原样。
- `DmSegMobileReply`：1 repeated DanmakuElem。顶层原始 bytes 不重编码，新增字段附加在末尾；已有元素只检查 action 去重。
- `DanmakuElem`：1 id、2 progress(ms)、3 mode、4 fontsize、5 color、6 mid_hash、7 content、8 ctime、9 weight、10 action、12 id_str、13 attr、25 type、26 oid、27 dm_from。固定标记来自协议互操作审计，非 UI 可配置文本。
- `bilibili.app.view.v1.ViewProgressReply` 与 `viewunite.v1.ViewProgressReply`：2 Chronos。Chronos 1 md5、2 file、3 sign。保留 view 的 1 video_guide 与 viewunite 的 4 dm；不净化其他字段。

这里只研究字段含义并自行编写编解码器，没有导入通用生成 protobuf runtime、去广告或 VIP 逻辑。测试消息全部合成，不附带用户流量。

## 远程模块版本映射

原 MD5 → 目标 ZIP MD5（文件名）：

```
45b564f5ba1fdd3746406937059addd8 -> e5a968f1a5055bbe5c12e67b100a6dcb
c29bd8f2b64a8f57f49c3622c0f763db -> ecca73e42e160074e0caf4b3ddb54a52
c218977c14e5dfdafd51edf3ae49ed02 -> f993a054969a4f6ae6b20a65f1292e47
8232ffb6ee43b687b5fe5add5b3e97de -> feaca416bbc1174b8e935cf87ff8f0b5
325e7073ffc6fb5263682fecdcd1058f -> 932002070dc1b51241198a074d2279fc
3a14beddd23328eaddfe9f0eb048d713 -> 8c3feda2e92bf60e8a7aeade1a231586
```

URL 前缀：`https://raw.githubusercontent.com/kokoryh/chronos/69a8996b1f1311b606021e3f194b0390280ab618/`。

通用版 ZIP 解包元数据为 `danmaku-flame-master 3.8.20`，作者 The Danmaku Flame Master Authors © bilibili；审计入口在 `res/src/danmaku/business/demand/entry_point/index_main.js`，业务检查转义的「空指部已就位」、`@airborne` 并调用播放器 seek。非通用版只核查 URL 和 ZIP 标识，不承诺完成等量源代码审计或真机版本兼容。

上游 [GPL-3.0 许可证](https://github.com/kokoryh/chronos/blob/69a8996b1f1311b606021e3f194b0390280ab618/LICENSE) 与源代码应从上游取得。本项目没有再分发 ZIP，MIT 只涵盖本仓库原创内容。模块包含完整业务代码和图像资源，其资产许可证需独立审查；远程引用并不为这些内容提供新的授权。

发布过程对每个固定 URL 检查 HTTP 200 和实际 ZIP MD5；该检查确认可获取性和文件标识，不证明模块安全。具体结果见发布报告，不保存下载 ZIP 到本仓库。

## 稳定性修复与失败策略（待真机验证）

冷缓存并行执行片段 GET 与原 DmSegMobile gRPC POST，降低串行累计延迟；暖缓存读取片段后只执行原弹幕重请求。片段 404 可负缓存；网络错误、超时、500、坏 JSON 不是可信空列表，不能负缓存。查询失败但原弹幕已有效返回时，应直接返回已取得的原响应而不注入；不要再次放行导致客户端重复重请求。原弹幕失败或无法安全表示时才放行原请求。每条路径恰好一次 `$done`，晚到回调不得再次结束脚本或覆盖结果。

运行入口独立处理 ViewProgress 响应和 DmSegMobile 请求。模块 auto 对已知 MD5 精确映射，未知 MD5 按 UA 中完整产品 token 识别 universal/hd/inter，不只检查前缀，也不接受任意子串误匹配；未知 UA 安全 no-op。手选模块覆盖映射。回退不保证兼容，移除 sign 不保证客户端接受。保留 video_guide、dm 和未知字段，不复制去广告逻辑。

## Loon 官方 API 契约核验

依据 [官方 Script API](https://nsloon.app/docs/Script/script_api/)（2026-10-03 查阅）：

- `$httpClient` 的 `alpn` 默认是 `h1`，允许 `h2`（Build 715+）。片段 GET 显式使用 `alpn:'h2'`，原 gRPC POST 同样使用 h2；指定协商参数不等于已证明目标链路真机协商成功。
- 回调 `response.h2_trailers` 是**可选字段**，只有服务器实际返回 HTTP/2 trailers 时才存在（Build 931+）。`undefined` 或 `{}` 不等于失败，也不等于官方保证 gRPC 成功；grpc-status 也可能位于响应 headers。读取状态应覆盖 headers/trailers，已知非零或冲突状态不得补成成功。
- 缺失 grpc-status 补 `0` 只能作为限定 moss 原 DmSegMobile 端点的兼容策略，并须先确认 HTTP 200、有效单消息 gRPC 帧及可解析业务消息；保留已有 trailers 和非零状态。不得对查询 GET、任意 URL、坏帧或错误响应泛化。这是项目假设，不是 Loon 官方语义，需真机验证。
- `requires_body=true`、`binary_body_mode=true` 使脚本 body 为 Uint8Array；HTTP 客户端 `'binary-mode':true` 强制回调 body 为 Uint8Array。Request Script 可用 `$done({response:{status,headers,h2_trailers,body}})` 返回响应；body 使用 Uint8Array，不转字符串或 Base64。Response Script 修改 body 同样接受 Uint8Array；`$done({})` 保留原请求/响应。
- 官方说明修改响应 body 后 Loon 会按传输协议处理 Content-Length、Transfer-Encoding、Content-Encoding；脚本仍应移除已失效长度与 HTTP 编码标记，不依赖旧长度。HTTP/2 响应不得透传非法 hop-by-hop/Transfer-Encoding 头。
- `$utils.ungzip` 同步接受并返回 Uint8Array，坏 gzip 抛异常。gRPC 帧 flag=1 的 gzip 解压后，以 flag=0 的 identity 新帧返回，清除旧 grpc-encoding 并标注 identity；HTTP Content-Encoding 与 gRPC 消息压缩是两层独立语义，不能互相代替。未知压缩、非 identity HTTP Content-Encoding、坏帧和 unary 多消息均不注入。未修改的 gzip 帧必须保留与之匹配的原编码 headers，不可仅把 headers 改成 identity。

## 未解决的播放器边界

通用模块除了检查固定文案与结束秒数，还在弹幕视图创建时要求 `videoPlayer.currentTime <= meta.progress` 才自动 seek。请求 field 6 progress 过滤已结束片段只能减少无效注入，不会消除网络迟到或修复 Chronos 的触发条件；**尚未给 Chronos 补迟到逻辑**。客户端缓存、响应脚本第一匹配抢占、模块识别 no-op、资源加载失败均可能产生“有文字但无 seek”。用户已观察 universal 替换和 ZIP 前缀现象，现有证据不足以归因；只收集安全阶段日志，不要求新的巨大 ZIP 或复制第三方原源码。
