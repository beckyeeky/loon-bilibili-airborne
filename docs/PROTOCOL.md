# 协议与依赖审计

## 字段最小集合

- `bilibili.community.service.dm.v1.DmSegMobileReq`：1 pid/AID（varint）、2 oid/CID、3 type（仅 1）、4 segment_index（1-based）。其余不解析，不改原请求。
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

## 严格失败策略

HTTP 只读服务错误、坏 JSON、未知 CID、非法 protobuf、无法支持的压缩或 unary 多消息都不注入。ViewProgress 多帧只在识别到明确 MD5 时替换。未知协议版本应先更新合成测试和审计再添加映射，不回退按 UA 强制选择模块。
