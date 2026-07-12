# 巡检任务中心模块

## 业务边界

巡检宝将视频、ZIP 图片包和直接上传图片统一归入“任务”。任务只描述一次采集批次和来源，不直接关联小区、街道或重点点位。

- 来源：人工上传、无人机、摄像头、智能眼镜。
- 输入：MP4/MOV 视频、单个 ZIP 图片包、一张或多张 JPG/JPEG/PNG 图片。
- 视频必须抽帧，抽帧间隔为 1-5 秒。
- ZIP 必须解压并过滤非图片文件。
- 所有输入最终都形成任务照片池。
- 一个任务最多对应一份综合报告。

## 真实处理流程

1. `POST /api/v1/inspection-tasks` 创建任务并上传素材。
2. 视频创建 `frame_extract` 异步任务；ZIP 创建 `archive_extract` 异步任务；直接图片立即入照片池。
3. 媒体 Worker 使用 FFmpeg 抽帧或安全解压图片，并写入 `MediaAsset` 与 `TaskPhoto`。
4. 任务状态变为 `ready_for_distribution`，前端通过真实统计和轮询同步处理结果。
5. 照片通过分发动作归入唯一对象档案，或标记为忽略。
6. 报告编写页可全选或部分选择任务照片，默认选择待分发与已归档照片；忽略照片保留手动选择能力。
7. 报告提交在一个数据库事务内更新报告主体和有序照片关系，一任务一份综合报告通过 `InspectionReport.taskId` 唯一约束保证。

## 数据关系

- `InspectionTask`：任务主表，保存任务日期、来源、输入类型、处理状态和照片计数。
- `MediaAsset`：保存原始视频、ZIP、直接图片、抽帧图片或解压图片的物理文件信息。
- `TaskPhoto`：任务照片业务表，每条记录只允许一个 `archiveObjectId`。
- `ManagedObject`：小区、街道、重点点位档案。
- `InspectionReport`：综合报告，`taskId` 唯一。
- `ReportPhoto`：综合报告与任务照片的有序关系，`reportId + taskPhotoId` 唯一。

归档和报告选图都只建立关联，不复制媒体文件。同一照片可同时通过“任务/日期”和“对象档案”两个维度查询，但不会同时归入多个对象档案。

## 主要接口

- `GET /api/v1/inspection-tasks`：分页、关键词、上传日期、来源和状态筛选，并返回真实统计。
- `GET /api/v1/inspection-tasks/:id`：任务详情。
- `GET /api/v1/inspection-tasks/:id/photos`：任务照片池。
- `GET /api/v1/task-photos?status=pending`：待分发照片池。
- `GET /api/v1/managed-objects/:objectId/photos`：指定档案的真实照片墙。
- `PATCH /api/v1/inspection-tasks/:id/photos/:photoId/distribution`：归档或忽略照片。
- `POST /api/v1/reports`：创建或更新任务综合报告，并事务保存 `taskPhotoIds`。
- `GET /api/v1/reports/:id`：报告详情及有序 `taskPhotoIds`。
- `GET /api/v1/media-assets/:id/content`：读取原始视频和照片文件。

## 部署依赖

- PostgreSQL：业务数据、唯一约束和并发写入。
- 文件存储：当前为服务器本地 `services/api/storage`，腾讯云部署可后续切换 COS。
- FFmpeg：视频离线抽帧。
- 媒体 Worker：异步处理队列执行者。

## 一致性与并发

- 全局 `/task-photos` 固定只返回待分发照片，已归档照片必须通过对象档案接口读取。
- 任务照片和待分发照片分页都使用 `id` 作为最终排序键，避免时间相同的数据跨页重复或遗漏。
- 照片分发使用条件更新保证同一照片只从待分发状态迁移一次；任务待分发数使用数据库原子递减，支持多人同时操作。
- 档案页按对象编号隔离请求，切换档案立即清空旧照片；推送成功后重新读取档案照片墙和待分发池。
- 编辑已有综合报告时先读取报告详情，再恢复字段、原有照片顺序与 `taskPhotoIds`；取消照片选择器不会清空已保存关系。
- 报告查询参数中的历史任务会按编号直接读取，不受任务列表默认 100 条分页限制。
- 并发分发失败的一方返回冲突，不写入成功审计，也不向前端报告伪成功。

主要数据库迁移文件：

- `services/api/prisma/migrations/20260711193000_real_inspection_tasks/migration.sql`
- `services/api/prisma/migrations/20260712090000_report_photos/migration.sql`
- `services/api/prisma/migrations/20260712120000_task_photo_query_indexes/migration.sql`
- `services/api/prisma/migrations/20260712123000_task_photo_pending_index_order/migration.sql`
