# Loon 哔哩哔哩八类别空降增强（Beta）

当前为**待真机验证的稳定性修复 Beta**：本插件独立处理 ViewProgress 响应的 Chronos 模块与 DmSegMobile 请求注入，不依赖原去广告插件，不需要修改其脚本。默认仅赞助类别。冷缓存查询与原弹幕重请求并行以降低累计等待；这不是播放器 seek 成功保证。离线验证方法见下文，真机验收尚未完成。

## 安装与试用

- [功能分支插件原文／更新地址](https://raw.githubusercontent.com/beckyeeky/loon-bilibili-airborne/feature/full-airborne/BilibiliAirborne.plugin)
- [导入 Loon](loon://import?plugin=https%3A%2F%2Fraw.githubusercontent.com%2Fbeckyeeky%2Floon-bilibili-airborne%2Ffeature%2Ffull-airborne%2FBilibiliAirborne.plugin)

要求 Loon 3.5.1 (998)+，复写、脚本与 MitM 开启，证书安装并信任，解密 grpc.biliapi.net、app.bilibili.com。

**首先禁用原插件整体建立真机 baseline 最可靠。** 只启用本插件，开启启用空降、赞助广告和安全诊断；用户当前使用 universal，保持该选择，不必重复切换 auto。更新插件与远程脚本缓存，完全退出并重启哔哩哔哩，从已有社区片段之前正常播放，保持弹幕开启，不先拖到片段内部。

若想先保留原去广告，可实验性地关闭其空降助手开关、把本插件放在前面；**这只是实验，不保证排序有效**。原插件宽泛 ViewProgress 响应仍可能抢占本插件，即使原空降开关关闭。Loon Script V2 同阶段最多执行第一条完整匹配脚本，不会串联两个脚本；以本插件 response-matched 日志验证是否执行。缺失时禁用原插件整体再试，并检查本地配置和其他插件。不要求编辑原插件或删除其脚本行。

## 下载与查询代理策略

插件内置以下分流规则，使用 Loon 插件合法的 `PROXY` 占位策略，不包含代理 URL，也不硬编码自定义策略组名称：

```text
[Rule]
DOMAIN,raw.githubusercontent.com,PROXY
DOMAIN,bsbsb.top,PROXY
```

更新插件后，在 Loon 的插件设置中为本插件的 `PROXY` 选择主配置中已有、可正常联网的代理策略组（具体入口和名称以所用 Loon 版本界面为准），并确认该组当前选中的节点可访问这两个域名。`raw.githubusercontent.com` 用于播放器模块下载及远程脚本资源，`bsbsb.top` 用于片段查询；两条规则共用本插件的 `PROXY` 选择，不是新增两个节点或策略组。

这是域名级分流：`raw.githubusercontent.com` 的全部路径都会受影响，不限于本项目或模块 ZIP；`bsbsb.top` 也匹配整个域名。主配置中优先级更高的规则可能覆盖插件规则，应以 Loon 实际连接的规则命中和策略结果为准。路由规则不需要为这两个域名额外开启 MitM。

本轮稳定性修复保留上述 `PROXY` 分流，并调整查询/弹幕并发、失败回退和协议兼容。代理可达不代表 ZIP 完整或客户端接受模块。用户已反馈 universal 替换成功但保存的 ZIP 响应体只有前缀；这一现象不足以判断客户端下载失败，不再重复要求新的巨大 ZIP 或完整抓包。优先用安全阶段日志和实际播放现象定位。

## 参数

| 参数 | 默认 | 含义 |
|---|---:|---|
| enabled | 开 | 请求注入与响应适配共同总开关 |
| module | auto | auto / universal / hd / inter，播放器模块选择 |
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
- 本插件独立适配 Chronos：单条 response 匹配 view.v1 / viewunite.v1，保留 video_guide、dm 与未知字段，仅替换 Chronos md5/file 并移除 sign。auto 优先精确 MD5 映射，未知 MD5 按 UA 产品 token 中的 bili-hd / bili-inter / bili-universal / bili/数字 / Bilibili 识别客户端回退，不仅检查字符串开头。未知或缺失 UA 安全 no-op；可确认客户端类型后手选 universal（普通版）、hd（HD）、inter（国际版），手选覆盖精确映射。回退和强制模块可能不兼容新版客户端，不保证全版本可用。

## 排查“有弹幕但不跳转”

开启 diagnostics，从片段之前正常播放，保持弹幕开启；首先禁用原插件整体建立 baseline，用户当前 universal 与现有 PROXY 选择保持不变。记录以下**日志信息类别**，实际事件名以当前脚本输出为准：

- 响应是否匹配、Chronos 是否存在、模块识别/强制选择与替换结果；
- 请求是否匹配、冷/暖缓存、查询开始/结束/错误；
- 原弹幕重请求开始/结束、HTTP/gRPC 状态、帧检查与回退；
- 候选片段数、已结束片段过滤、注入数、总阶段耗时与超时。

冷缓存时查询和原弹幕重请求并行，累计网络等待由串行相加趋向两者较慢的一项，但仍受网络、脚本调度和播放器预加载影响。暖缓存无需查询；分别观察两种路径，不把一次暖缓存结果当作冷缓存验证。查询错误不是可信空列表，不应写入负缓存；若原弹幕已有效返回，应直接返回该结果，避免再放行导致重复请求。

没有响应匹配日志时检查 MitM、规则、缓存与响应抢占。模块替换只证明响应改写，不证明客户端下载/接受模块；注入或空指文字不等于 seek 成功。请求 field 6 progress 用于剔除已结束片段，无法解决所有迟到触发；**尚未修改 Chronos 的迟到条件**，其创建弹幕视图时的 `currentTime <= progress` 约束仍在。验收必须亲眼看到从片段起点跳到结束位置。

反馈只提供 Loon build、客户端版本及普通/HD/国际版、模块参数、安全阶段日志、可见 HTTP/gRPC 状态、是否出现空指文字及是否自动跳转。不再要求新的巨大 ZIP；不要提供完整抓包、原始 URL、BV/CID、鉴权头、token、Cookie、实际 MD5、模块地址或原始异常。

## 许可与验证

本仓库原创 JS/测试采用 MIT；不复制或再分发第三方脚本和 ZIP。实际播放器跳转使用固定提交 [kokoryh/chronos](https://github.com/kokoryh/chronos/tree/69a8996b1f1311b606021e3f194b0390280ab618)，仓库 LICENSE 为 GPL-3.0，模块元数据标识 The Danmaku Flame Master Authors © bilibili。第三方许可和资源署名保留；仓库级许可不代表所有图片可再分发。启用本插件意味着接受第三方模块执行风险，MD5 不是安全签名。模块可达、签名被客户端接受和真机兼容仍待验证。

开发：Node.js 20+，`npm test`，无 npm 依赖。离线协议与资源记录见 [PROTOCOL](docs/PROTOCOL.md)、[VALIDATION](docs/VALIDATION.md)。功能分支 `feature/full-airborne` 不合 main；重现请固定提交 SHA 的脚本地址。参考 [官方 Script V2](https://nsloon.app/docs/Script/script_v2)。
