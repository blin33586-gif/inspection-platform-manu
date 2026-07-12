# 标注版本化保存与疑似事件复核设计

## 目标与交付顺序

本阶段按依赖关系拆为两个独立模块：

1. **标注数据真实保存**：先建立任务照片的统一、版本化标注底座。
2. **疑似事件与人工复核中心**：只在标注底座稳定后建设，引用确定的标注版本。

不在第一阶段直接建设事件中心，避免后续补齐标注历史、说明和版本关系时重构事件证据结构。

## 统一业务规则

- `TaskPhoto` 是任务、档案、报告、标注与事件共同使用的唯一照片实体。
- 物理媒体文件只保存一份；标注、报告、档案和事件只保存关系与版本引用。
- 一张照片最多归档到一个小区、道路或重点点位；归档动作不会复制图片。
- 一份综合报告属于一个任务，报告照片和事件均引用任务内照片。
- 媒体库、档案照片墙和报告编写页进入同一照片时，必须读取同一份当前标注。

## 模块一：标注数据真实保存

### 数据模型

为每张 `TaskPhoto` 建立一个当前标注文档，并保存不可修改的历史版本。

```text
PhotoAnnotationDocument
- id
- taskPhotoId                    // 唯一，一张任务照片一份当前文档
- currentVersion                 // 当前版本号，从 1 开始
- annotationJson                 // 矩形、箭头、文字、颜色及坐标
- issueDescription               // 当前照片的问题说明
- longitude
- latitude
- altitude
- source                         // manual | ai
- createdBy
- updatedBy
- createdAt
- updatedAt

PhotoAnnotationVersion
- id
- documentId
- version                        // 与 documentId 组合唯一
- annotationJson
- issueDescription
- longitude
- latitude
- altitude
- source
- createdBy                      // 产生该版本的操作者
- createdAt
```

`annotationJson` 使用画布相对坐标，坐标范围为 `0..1`，不保存与浏览器尺寸绑定的像素值。元素类型固定为：

- `rectangle`：左上坐标、宽高、边框颜色、可选文字。
- `arrow`：起点、终点、颜色、可选文字。
- `text`：锚点、文字、颜色、可选宽度。

每个元素带稳定 `id`，以便前端重新打开后继续编辑、事件或报告审计时准确定位。

### 保存与并发控制

保存接口必须携带 `expectedVersion`：

1. 服务端读取当前 `currentVersion`。
2. 不一致时返回 `409 Conflict`，不写入数据。
3. 一致时在同一数据库事务中：将当前内容写入 `PhotoAnnotationVersion`，更新当前文档内容，并将 `currentVersion + 1`。
4. 新历史版本写入后永不更新或删除。

这套乐观锁规则避免两个用户打开同一照片后，旧页面覆盖新页面内容。冲突页面只能刷新并基于最新版本重新编辑。

### 接口

```http
GET  /api/v1/task-photos/:photoId/annotation
GET  /api/v1/task-photos/:photoId/annotation/versions
GET  /api/v1/task-photos/:photoId/annotation/versions/:version
PUT  /api/v1/task-photos/:photoId/annotation
```

更新请求：

```json
{
  "expectedVersion": 3,
  "annotationJson": { "canvasVersion": 1, "elements": [] },
  "issueDescription": "楼顶堆料，需现场复核。",
  "longitude": 121.468,
  "latitude": 31.286,
  "altitude": 86.5,
  "source": "manual"
}
```

### 前端行为

- 报告编写画布载入当前标注文档，而不是临时浏览器状态。
- 点击“暂存”或明确保存时调用更新接口；保存成功后更新本地版本号。
- 页面刷新、从媒体库进入、从档案进入时均重新读取当前文档。
- 提供“版本历史”入口，默认只读查看旧版本；旧版本不允许覆写当前文档。
- 保存发生版本冲突时，保留用户当前未提交编辑，显示冲突提示并可刷新最新版本。

### 验收

- 刷新页面后矩形、箭头、文字、颜色和逐张说明完整恢复。
- 同一照片从媒体库、档案与报告入口进入，显示一致的当前标注。
- 每次保存可查询到对应不可修改历史版本。
- 两个页面并发保存时，旧版本保存被拒绝，不能覆盖新版本。

## 模块二：疑似事件与人工复核中心

### 数据模型

事件独立于现有线索表。线索只是经确认事件的后续处置入口。

```text
SuspectedEvent
- id
- taskId
- issueType
- severity                       // low | medium | high
- source                         // ai | manual
- reviewStatus                   // pending_review | confirmed | excluded
- falsePositiveReason            // excluded 时必填
- archiveObjectId                // 可为空；归档后关联唯一对象
- primaryTaskPhotoId             // 最高置信度或人工指定的主证据
- primaryAnnotationVersion       // 主证据使用的具体标注版本
- videoStartSeconds
- videoEndSeconds
- durationSeconds
- averageConfidence              // 人工事件为空
- maxConfidence                  // 人工事件为空
- createdBy
- reviewedBy
- reviewedAt
- createdAt
- updatedAt

SuspectedEventEvidence
- id
- eventId
- taskPhotoId
- annotationVersion              // 证据引用的不可变版本
- confidence                     // 人工证据可为空
- capturedAt
- sortIndex

IssueLead.sourceEventId          // 唯一；保证一事件最多转一条线索
```

报告可保存 `SuspectedEvent` 关系，或通过已选 `TaskPhoto` 和事件证据推导展示。实现期以显式关系为准，防止报告修改照片选择后丢失事件记录。

### 自动合并规则

仅 AI 命中参与自动合并，规则为：

1. 必须属于同一任务、同一问题类型、同一归档对象。
2. 至少连续命中两张照片。
3. 相邻照片时间差不超过抽帧间隔的两倍，且上限为 10 秒。
4. 时间来源依次为 EXIF 拍摄时间、文件名时间序号、ZIP 内或上传顺序。
5. 没有可用时间时不自动合并，保留人工合并入口。
6. 事件保留全部证据，最高置信度照片作为默认主图。

人工创建事件允许只选择一张照片，不受连续两张规则限制；其来源为 `manual`，AI 置信度留空。

### 复核与线索规则

状态只表达复核结论：

```text
pending_review -> confirmed | excluded
```

- `excluded` 必须填写误报原因。
- `confirmed` 后可加入当前任务的综合报告、归入对象档案、转为待跟进线索。
- 转线索是独立动作，不混入复核状态。
- `IssueLead.sourceEventId` 唯一；重复转线索返回业务错误，不创建第二条线索。
- 人工可以拆分或合并事件、调整时间范围、替换主证据；所有改动必须记录操作日志。

### 页面结构

- 左侧：任务、问题类型、复核状态、档案对象筛选。
- 中间：事件列表，展示主图、时间范围、置信度、严重程度和复核状态。
- 右侧：事件详情、连续照片、被引用的标注版本、复核动作、报告和线索动作。

事件详情打开标注时必须加载 `SuspectedEventEvidence.annotationVersion`，而不是直接加载可能已变化的当前标注。

## 错误处理与审计

- 非法标注 JSON、超出 `0..1` 的坐标或未知元素类型：拒绝保存。
- 照片不存在或不属于指定任务：拒绝创建或更新事件。
- 已排除且无误报原因：拒绝复核提交。
- 同一事件重复转线索：返回冲突并跳转已有线索。
- 所有标注保存、版本冲突、事件复核、拆分合并、转线索动作写入操作日志。

## 实施边界

### 第一阶段范围

- Prisma 迁移、当前标注文档与历史版本。
- 标注读取、保存、历史查询与乐观锁接口。
- 报告编写页接入真实标注保存和版本冲突提示。
- 媒体库与档案入口复用同一标注读取能力。

### 第二阶段范围

- AI 连续照片自动合并。
- 人工事件创建、事件复核、事件证据和标注版本引用。
- 事件中心三栏页面。
- 已确认事件加入报告、归档、转待跟进线索。

### 非本期范围

- 实时视频告警。
- AI 模型训练或在线推理服务。
- 多用户在线协同编辑同一画布。
- 自动将一个照片同时归档到多个对象。

## 测试与验收

### 第一阶段

- 保存后刷新、跨入口读取和历史版本查询一致。
- 标注元素、逐张说明、经纬度、高度、来源和操作者字段完整保存。
- 两个并发写入使用相同 `expectedVersion` 时，只有一个成功。
- 报告保存后仍可按具体版本还原证据标注。

### 第二阶段

- 满足连续规则的 AI 照片合并为一个事件，不满足时不自动合并。
- 人工可以单图创建事件。
- 已排除事件缺少误报原因时被拒绝。
- 已确认事件只能生成一条待跟进线索。
- 事件详情显示其引用的历史标注版本，而不是后续修改后的当前标注。
