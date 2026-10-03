# Beta 发布验证记录

## 离线测试

执行 `npm test`（Node.js 原生 test runner，无外部依赖）：27 tests，27 pass，0 fail，0 skipped。新增独立响应两路径、gRPC gzip、unknown MD5 UA 回退（普通/HD/国际）、手动模块、未知 UA、参数、安全日志、no-chronos/坏帧/多消息/no-op 与每次恰好一次 $done 回归。模拟测试不是播放器端到端测试。

## 远程资源验证

所有 URL 固定到 Chronos 提交 `69a8996b1f1311b606021e3f194b0390280ab618`，GET 200，下载实际 MD5 与文件名一致：

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

## 未完成验收

未在 Loon 998/1005、真实 iPhone/iPad 哔哩哔哩运行。本版本已恢复独立响应适配，无需原插件；未知 MD5 对识别 UA 回退，未知 UA 保持 no-op。未确认客户端下载第三方 Chronos、移除签名后加载、关闭弹幕、seek 回看、跨弹幕分段预加载时行为。Beta 的「完整」指八类别配置与本项目功能实现完整，不表示所有版本兼容或已通过真机验收。
