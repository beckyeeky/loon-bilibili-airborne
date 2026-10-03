# Beta 发布验证记录

## 离线验证方法

当前状态为**待真机验证的稳定性修复**，不以旧测试数量代表本轮验证结果。使用 Node.js 20+ 在仓库根目录执行 `npm test`（原生 test runner，无外部依赖），测试数量、通过/失败及退出码以当次实际输出为准。本轮测试由测试分工维护，本说明不预先宣称 23/27 或其他数量通过。

回归重点：冷缓存查询与 gRPC 同时启动、暖缓存不发查询；查询 error/超时不写空负缓存且能返回已取得原弹幕；非空有效查询才按 CID/类别/时长/分段注入；field 6 progress 剔除已结束片段；GET/POST h2 参数；UA 产品 token；限定 moss 缺 grpc-status 补零及非零/冲突拒绝；identity/gzip、binary `$done`、headers/trailers 保留；晚到回调、watchdog 与恰好一次 `$done`；安全日志不泄漏标识。模拟测试不是播放器端到端测试。

## 远程资源验证

以下为已有发布记录，**本轮未重新下载或重新核验全部 ZIP**。所有 URL 固定到 Chronos 提交 `69a8996b1f1311b606021e3f194b0390280ab618`；此前记录为 GET 200，下载实际 MD5 与文件名一致：

| ZIP MD5 | 字节数 |
|---|---:|
| e5a968f1a5055bbe5c12e67b100a6dcb | 983408 |
| ecca73e42e160074e0caf4b3ddb54a52 | 1055273 |
| f993a054969a4f6ae6b20a65f1292e47 | 965523 |
| feaca416bbc1174b8e935cf87ff8f0b5 | 1054471 |
| 932002070dc1b51241198a074d2279fc | 879597 |
| 8c3feda2e92bf60e8a7aeade1a231586 | 879023 |

部分下载首轮出现 IncompleteRead，最多三次有限重试后成功。网络稳定性并不保证；项目未把 ZIP 存入 Git 仓库。

## 语法与人工审计

核对官方 Script V2 的 `request/response if ... then script(...) with ...`、参数对象、requires_body、binary_body_mode，以及 Script API 的 timeout 毫秒、binary-mode、alpn、ungzip、$done 空对象继续契约。

保留未知字段，没有提交原始脚本、抓包、错误页、身份信息或第三方 ZIP。只发布原创插件、脚本、测试、文档、MIT 许可证与 Actions 配置。

## 本轮官方契约审阅

2026-10-03 查阅 [官方 Script API](https://nsloon.app/docs/Script/script_api/)，确认 h2_trailers 为服务器实际返回时才存在的可选字段（Build 931+）；alpn 默认为 h1，可指定 h2；binary-mode 返回 Uint8Array；`$done` 支持直接响应与 Uint8Array body；`$utils.ungzip` 是同步二进制 API，修改 body 后 Loon 会处理相关传输 headers。详细语义和补 grpc-status=0 的项目假设见 [PROTOCOL](PROTOCOL.md)，不能把缺 trailers 当成官方成功保证。

## 真机验收步骤与未解决项

1. 禁用原插件整体及其他冲突脚本建立 baseline；仅启用本插件，用户当前模块 universal 保持不变，PROXY 保持现有可用选择，更新远程脚本缓存。
2. 开安全诊断，从片段之前正常播放、弹幕保持开启。先观察冷缓存，再重复观察暖缓存；不混淆两次结果，也不清空其他脚本存储。
3. 提供模块匹配/替换、缓存、查询、原弹幕重请求、HTTP/gRPC/帧检查、候选/已结束过滤/注入、阶段耗时和回退等日志信息类别；事件名以实际脚本为准，不要求新的巨大 ZIP。
4. 记录是否看到空指文字、是否亲眼自动 seek 到片段终点、是否仍有正常弹幕；测试查询失败时原弹幕是否保留。反馈仅含 Loon build、客户端版本/类型、参数和脱敏日志，不含 URL、BV/CID、token、Cookie、原始异常或完整抓包。

尚未完成 Loon 998/1005 与真实 iPhone/iPad 的端到端验收。用户已有 universal 替换和保存 ZIP 仅前缀的反馈，但不足以证明客户端下载或加载失败。本轮并发仅降低累计等待，不能保证 seek。field 6 progress 只过滤已结束片段；**Chronos 晚到触发条件尚未补丁修复**。客户端下载、移除签名后的模块接受、关闭弹幕、回看及跨分段预加载仍待确认。Beta 不表示全版本兼容或已通过真机验收。
