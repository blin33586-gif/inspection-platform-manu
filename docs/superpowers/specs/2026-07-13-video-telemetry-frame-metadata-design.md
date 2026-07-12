# MP4 遥测抽帧与历史数据回填设计

## 1. 目标

重做巡检宝的 MP4 抽帧数据链路。视频抽帧时不再只生成 JPEG 和视频时间点，而是同时解析视频遥测轨，将每张照片对应的拍摄时间、GPS、高度、云台角度和镜头信息保存到巡检宝。

本阶段同时回填当前已上传的 DJI M3TD 红外视频及其已抽帧照片，不重新上传视频，不重复生成照片。

## 2. 已确认的视频数据

当前测试视频为 DJI M3TD 生成的 MP4，包含：

- H.264 红外画面，`640 x 512 @ 29.97fps`。
- `djmd` DJI 元数据轨。
- `mov_text` 逐帧字幕遥测轨。
- 字幕中可直接解析时间、经纬度、相对高度、海拔高度、云台偏航／俯仰／横滚、焦距与数字变焦倍率。

第一阶段以字幕遥测轨为稳定数据源。`djmd` 保留为后续适配器，不在本阶段解析私有二进制协议。

## 3. 模块设计

### 3.1 视频遥测解析模块

模块只暴露一个主接口：

```ts
extractVideoTelemetry(videoPath: string): Promise<VideoTelemetryTrack>
```

模块内部负责：

1. 使用 `ffprobe` 检测视频是否存在字幕遥测轨。
2. 使用 `ffmpeg` 将字幕轨转换为 SRT 文本。
3. 解析为按 `timestampMs` 升序排列的结构化记录。
4. 报告解析类型、记录数量、时间范围和解析警告。

结构化记录：

```text
VideoTelemetrySample
- timestampMs
- capturedAt
- latitude
- longitude
- relativeAltitudeMeters
- absoluteAltitudeMeters
- gimbalYawDegrees
- gimbalPitchDegrees
- gimbalRollDegrees
- focalLengthMillimeters
- digitalZoomRatio
```

任何单条无法解析时不中断整个任务，但必须记录警告和跳过数量。没有遥测轨时返回 `source: none`，不让抽帧任务失败。

### 3.2 抽帧时间匹配模块

模块接口：

```ts
matchFrameTelemetry(frameTimestampMs: number, track: VideoTelemetryTrack): MatchedFrameTelemetry | null
```

匹配规则：

- 使用与抽帧时间点最近的遥测记录。
- 值相同时优先选择不晚于抽帧时间点的记录。
- 记录 `matchOffsetMs`，便于检查匹配质量。
- 默认最大允许误差为 `250ms`。超出时该照片不写遥测，但保留抽帧结果并记录警告。
- 不对 GPS 、角度或高度做插值；以最近的真实样本为准。

## 4. 数据归属

### 4.1 `TaskPhoto`

`TaskPhoto` 保留高频业务查询需要的字段：

- `capturedAt`
- `videoTimestampMs`
- `latitude`
- `longitude`
- `absoluteAltitudeMeters`
- `relativeAltitudeMeters`

### 4.2 `TaskPhotoTelemetry`

为每张有遥测的任务照片建立一对一遥测记录：

```text
TaskPhotoTelemetry
- id
- taskPhotoId
- source                  // dji_subtitle | none
- sourceTimestampMs
- matchOffsetMs
- capturedAt
- latitude
- longitude
- relativeAltitudeMeters
- absoluteAltitudeMeters
- gimbalYawDegrees
- gimbalPitchDegrees
- gimbalRollDegrees
- focalLengthMillimeters
- digitalZoomRatio
- createdAt
- updatedAt
```

`TaskPhoto` 上的常用位置字段和 `TaskPhotoTelemetry` 必须在同一数据库事务中写入，不允许两者不一致。

## 5. JPEG EXIF

抽帧图片生成后，将可用的标准字段写入 JPEG EXIF：

- `DateTimeOriginal`
- `GPSLatitude`
- `GPSLongitude`
- `GPSAltitude`
- `FocalLength`
- `UserComment`：记录相对高度、云台角度、变焦倍率和原视频时间点。

EXIF 写入失败时，数据库遥测仍必须保存。该失败记录为任务警告，不删除抽帧图片。数据库是巡检宝的权威数据源，EXIF 只是下载后的便携副本。

## 6. 抽帧流程

```text
原始 MP4
  ↓
并行执行
  ├─ FFmpeg 按间隔抽帧
  └─ 解析遥测轨
  ↓
按 videoTimestampMs 匹配最近遥测
  ↓
写入 JPEG EXIF
  ↓
一个数据库事务中写入 MediaAsset、TaskPhoto、TaskPhotoTelemetry
  ↓
更新任务统计和处理报告
```

处理任务的 `outputJson` 新增：

- `telemetrySource`
- `telemetrySampleCount`
- `telemetryMatchedFrameCount`
- `telemetryUnmatchedFrameCount`
- `telemetryWarningCount`
- `exifWrittenFrameCount`
- `exifFailedFrameCount`

## 7. 历史数据回填

提供可重复运行且幂等的回填命令：

```text
pnpm telemetry:backfill --media-id <mediaId>
```

回填流程：

1. 读取原始 MP4 的字幕遥测轨。
2. 读取既有抽帧 `MediaAsset.videoTimestampMs` 和关联 `TaskPhoto`。
3. 按相同匹配规则更新常用字段和一对一遥测记录。
4. 将标准字段写入已有 JPEG EXIF。
5. 对已回填且源时间不变的照片执行 upsert，不创建重复记录。
6. 输出匹配、跳过、失败和 EXIF 写入统计。

首次回填目标：

- 视频：`media-baea0035-73e9-4223-94ce-6f35ed234ce0`
- 任务：`task-media-baea0035-73e9-4223-94ce-6f35ed234ce0`

## 8. 前端与业务联动

- 报告编写页选中抽帧照片时，自动显示拍摄时间、GPS、高度、云台角度、焦距和变焦倍率。
- 标注暂存默认带入遥测 GPS 和高度；用户手工修改后不在页面刷新时强制覆盖。
- 事件推送和分享卡继续从保存的标注版本获取 GPS；当用户未手工修改时，该值来自视频遥测。
- 抽帧照片列表保留原视频时间标签，不因遥测时间而移除。

## 9. 错误处理与安全

- 无遥测轨、遥测部分损坏或某张照片无匹配时，抽帧仍然完成。
- 不在日志中输出整条飞行轨迹；日志只记录统计和抽样警告。
- 所有原始路径继续经过存储根目录边界检查。
- 字幕文本仅用于任务内解析，默认不作为公开附件。

## 10. 验收标准

1. 新视频抽帧任务在存在 DJI 字幕遥测轨时，为每张匹配照片写入结构化遥测。
2. 无遥测视频仍正常抽帧，并显示“未检测到遥测数据”。
3. 遥测匹配误差不超过 `250ms`，且每张保存 `matchOffsetMs`。
4. 数据库与 JPEG EXIF 中的 GPS、时间和高度一致。
5. 报告编写页能直接看到遥测信息，地图二维码能使用自动坐标。
6. 回填命令可重复运行，不创建重复照片或遥测记录。
7. 当前 M3TD 视频的首帧匹配结果接近已确认的 `31.229247, 121.634603`，相对高度约 `79.969m`，并与原始字幕轨抽样核对。
8. API、媒体工作进程、前端类型检查和生产构建通过。

## 11. 模块边界与后续顺序

本阶段不解析 MP4 像素温度，不接入 DJI Thermal SDK，不增加点测温或区域测温。

本模块完成、验证并锁定后，按以下顺序开启后续独立模块：

1. 基于 DJI Thermal SDK 的 Linux R-JPEG 测温解析模块。
2. 鼠标点测温与区域最高／最低／平均温度交互。
3. 测温标注、异常阈值、事件推送和报告卡联动。
