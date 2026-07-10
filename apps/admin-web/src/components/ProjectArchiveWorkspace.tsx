import { useEffect, useMemo, useState } from "react";
import { Button, Input, message, Modal } from "antd";
import { Download, Pencil, Printer, Search, Trash2, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";

export type ProjectArchiveVariant = "community" | "road" | "point";

export interface ProjectArchiveItem {
  id: string;
  name: string;
  status: string;
  issueCount: number;
  reportCount: number;
  typeLabel: string;
  relatedName?: string;
  path: string;
}

export interface ProjectArchiveGroup {
  key: ProjectArchiveVariant;
  label: string;
  path: string;
  items: ProjectArchiveItem[];
}

export interface ProjectArchiveMediaItem {
  id: string;
  title: string;
  linkedObjectId?: string;
  linkedObjectName: string;
  issueTitle: string;
  status: string;
  capturedAt: string;
  sourceName: string;
  thumbnailUrl: string;
  fileName: string;
}

interface BasicInfoDraft {
  area: string;
  typeLabel: string;
  owner: string;
  frequency: string;
  range: string;
  remark: string;
}

interface ProjectArchiveWorkspaceProps {
  activeItem?: ProjectArchiveItem;
  items: ProjectArchiveItem[];
  mediaItems?: ProjectArchiveMediaItem[];
  projectGroups?: ProjectArchiveGroup[];
  variant: ProjectArchiveVariant;
}

const archiveMeta: Record<ProjectArchiveVariant, {
  archiveTitle: string;
  badge: string;
  navTitle: string;
  area: string;
  owner: string;
  frequency: string;
  range: string;
  photoTitle: string;
}> = {
  community: {
    archiveTitle: "小区综合档案",
    badge: "小区档案",
    navTitle: "小区档案",
    area: "上海市虹口区 / 曲阳路街道 / 居住小区",
    owner: "曲阳路街道城运中心、居委协同",
    frequency: "每周 2 次",
    range: "小区出入口、楼栋外立面、车棚、公共通道",
    photoTitle: "小区问题照片墙",
  },
  road: {
    archiveTitle: "道路街面档案",
    badge: "道路街面",
    navTitle: "街道档案",
    area: "上海市虹口区 / 曲阳路街道 / 沿街区域",
    owner: "曲阳路街道综合行政执法队",
    frequency: "每日 2 次",
    range: "沿街商铺、广告牌、占道经营、非机动车停放",
    photoTitle: "街面问题照片墙",
  },
  point: {
    archiveTitle: "重点点位档案",
    badge: "重点点位",
    navTitle: "重点点位",
    area: "上海市虹口区 / 曲阳路街道 / 重点设施点位",
    owner: "曲阳路街道巡检专班",
    frequency: "按专项任务复查",
    range: "广告牌、河道绿化、重点设施、反复问题点",
    photoTitle: "点位问题照片墙",
  },
};

const issueTemplates = [
  { title: "非机动车乱停放", status: "待整改", date: "2026-07-03 09:45", severity: "warning" },
  { title: "沿街广告牌破损", status: "待整改", date: "2026-07-02 16:30", severity: "danger" },
  { title: "建筑垃圾临时堆放", status: "待复查", date: "2026-07-02 11:15", severity: "warning" },
  { title: "飞线充电隐患", status: "已整改", date: "2026-07-01 15:10", severity: "success" },
  { title: "绿化带杂物堆放", status: "已整改", date: "2026-06-30 10:25", severity: "success" },
];

const timelineItems = [
  { title: "待整改超时提醒", description: "系统已生成复查提醒，等待责任单位处置", time: "2026-07-03 16:30", tone: "danger" },
  { title: "问题上报", description: "无人机巡检发现疑似问题，进入台账", time: "2026-07-03 09:45", tone: "warning" },
  { title: "问题派发", description: "已派发至街道处置人员", time: "2026-07-03 10:20", tone: "info" },
  { title: "现场核实", description: "处置人员现场核实问题情况", time: "2026-07-03 10:40", tone: "info" },
  { title: "处置中", description: "正在安排整改和复查", time: "2026-07-03 11:05", tone: "muted" },
];

function statusTone(status: string) {
  if (status.includes("重点") || status.includes("超时")) return "danger";
  if (status.includes("待")) return "warning";
  if (status.includes("稳定") || status.includes("已")) return "success";
  return "info";
}

function archiveCode(variant: ProjectArchiveVariant, item?: ProjectArchiveItem) {
  const prefix = variant === "community" ? "SQ" : variant === "road" ? "JD" : "DW";
  const suffix = item?.id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() ?? "000001";

  return `${prefix}202607${suffix}`;
}

function buildBasicInfo(meta: (typeof archiveMeta)[ProjectArchiveVariant], item?: ProjectArchiveItem): BasicInfoDraft {
  return {
    area: meta.area,
    typeLabel: item?.typeLabel ?? meta.badge,
    owner: meta.owner,
    frequency: meta.frequency,
    range: meta.range,
    remark: item?.relatedName ? `关联 ${item.relatedName}` : "重点关注反复发生问题",
  };
}

export function ProjectArchiveWorkspace({ activeItem, items, mediaItems = [], projectGroups, variant }: ProjectArchiveWorkspaceProps) {
  const meta = archiveMeta[variant];
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [basicInfo, setBasicInfo] = useState<BasicInfoDraft>(() => buildBasicInfo(meta, activeItem));
  const [basicInfoDraft, setBasicInfoDraft] = useState<BasicInfoDraft>(() => buildBasicInfo(meta, activeItem));
  const pendingCount = activeItem ? Math.max(1, Math.round(activeItem.issueCount * 0.38)) : 0;
  const fixedCount = activeItem ? Math.max(0, activeItem.issueCount - pendingCount) : 0;
  const visibleProjectGroups = projectGroups ?? [{
    key: variant,
    label: meta.navTitle,
    path: `/${variant === "community" ? "communities" : variant === "road" ? "roads" : "points"}`,
    items,
  }];
  const defaultLinkedMediaIds = useMemo(() => {
    if (!activeItem) return [];

    return mediaItems
      .filter((item) => item.linkedObjectId === activeItem.id || item.linkedObjectName === activeItem.name)
      .map((item) => item.id);
  }, [activeItem?.id, activeItem?.name, mediaItems]);
  const [linkedMediaIds, setLinkedMediaIds] = useState<string[]>(defaultLinkedMediaIds);
  const linkedMediaItems = mediaItems.filter((item) => linkedMediaIds.includes(item.id));
  const availableMediaItems = mediaItems.filter((item) => !linkedMediaIds.includes(item.id));

  useEffect(() => {
    const nextBasicInfo = buildBasicInfo(meta, activeItem);
    setBasicInfo(nextBasicInfo);
    setBasicInfoDraft(nextBasicInfo);
    setIsEditingBasicInfo(false);
  }, [activeItem?.id, activeItem?.relatedName, activeItem?.typeLabel, meta]);

  useEffect(() => {
    setLinkedMediaIds(defaultLinkedMediaIds);
  }, [defaultLinkedMediaIds]);

  if (!activeItem) {
    return (
      <section className="project-archive-empty">
        <Search size={24} />
        <strong>暂无档案</strong>
        <span>新增项目对象后会在这里生成档案工作台。</span>
      </section>
    );
  }

  return (
    <section className="project-archive-shell">
      <aside className="archive-navigation-panel">
        <div className="archive-side-title">
          <strong>档案导航</strong>
          <span>{meta.navTitle}</span>
        </div>
        <Input.Search placeholder="输入关键词搜索" />
        <div className="archive-tree">
          <details open>
            <summary>曲阳路街道</summary>
            {visibleProjectGroups.map((group) => (
              <details key={group.key} open={group.key === variant}>
                <summary className={group.key === variant ? "active-folder" : ""}>
                  <Link to={group.path}>{group.label}</Link>
                  <em>{group.items.length}</em>
                </summary>
                {group.items.length ? (
                  <div className="archive-tree-items">
                    {group.items.map((item) => (
                      <div className={`archive-tree-item-row ${item.id === activeItem.id ? "active" : ""}`} key={item.id}>
                        <Link to={item.path}>
                          <span>{item.name}</span>
                          <em>{item.issueCount}</em>
                        </Link>
                        <div className="archive-tree-actions">
                          <button
	                            type="button"
	                            onClick={(event) => {
	                              event.preventDefault();
	                              if (item.id === activeItem.id) {
	                                setBasicInfoDraft(basicInfo);
	                                setIsEditingBasicInfo(true);
	                                message.info(`正在编辑 ${item.name} 的基础信息`);
	                                return;
	                              }
	                              message.info(`请先打开 ${item.name} 后编辑基础信息`);
	                            }}
	                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              message.warning(`删除 ${item.name} 前需要二次确认`);
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="archive-tree-empty">暂无具体档案</div>
                )}
              </details>
            ))}
          </details>
        </div>
        <button className="archive-collapse-button" type="button">收起导航</button>
      </aside>

      <div className="archive-main-board">
        <div className="archive-breadcrumb">当前位置：项目 / {meta.navTitle} / {activeItem.name}</div>
        <div className="archive-title-row">
          <div>
            <h2>{activeItem.name}</h2>
            <span className="archive-badge">{meta.badge}</span>
          </div>
          <div className="archive-actions">
	            <Button
	              icon={<Pencil size={15} />}
	              onClick={() => {
	                setBasicInfoDraft(basicInfo);
	                setIsEditingBasicInfo(true);
	              }}
	            >
	              编辑档案
	            </Button>
            <Button danger icon={<Trash2 size={15} />} onClick={() => message.warning(`删除 ${activeItem.name} 前需要二次确认`)}>删除</Button>
            <Button icon={<Download size={15} />} onClick={() => message.info("导出档案功能将接入服务器文件生成")}>导出档案</Button>
            <Button icon={<Printer size={15} />} onClick={() => message.info("打印档案功能已预留")}>打印档案</Button>
          </div>
        </div>
        <div className="archive-meta-line">
          <span>档案编号：{archiveCode(variant, activeItem)}</span>
          <span>创建时间：2026-07-03</span>
          <span>创建人：系统自动生成</span>
        </div>

	        <section className="archive-overview-card">
	          <div className="archive-basic-card">
	            <div className="archive-card-title-row">
	              <div className="archive-card-title">基础信息</div>
	              {isEditingBasicInfo ? (
	                <div className="archive-basic-actions">
	                  <Button
	                    size="small"
	                    type="primary"
	                    onClick={() => {
	                      setBasicInfo(basicInfoDraft);
	                      setIsEditingBasicInfo(false);
	                      message.success("基础信息已暂存到当前档案");
	                    }}
	                  >
	                    保存
	                  </Button>
	                  <Button
	                    size="small"
	                    onClick={() => {
	                      setBasicInfoDraft(basicInfo);
	                      setIsEditingBasicInfo(false);
	                    }}
	                  >
	                    取消
	                  </Button>
	                </div>
	              ) : (
	                <Button size="small" icon={<Pencil size={13} />} onClick={() => setIsEditingBasicInfo(true)}>
	                  编辑
	                </Button>
	              )}
	            </div>
	            {isEditingBasicInfo ? (
	              <div className="archive-basic-editor">
	                <label>
	                  <span>所在区域</span>
	                  <Input value={basicInfoDraft.area} onChange={(event) => setBasicInfoDraft((draft) => ({ ...draft, area: event.target.value }))} />
	                </label>
	                <label>
	                  <span>所属类型</span>
	                  <Input value={basicInfoDraft.typeLabel} onChange={(event) => setBasicInfoDraft((draft) => ({ ...draft, typeLabel: event.target.value }))} />
	                </label>
	                <label>
	                  <span>管理责任</span>
	                  <Input value={basicInfoDraft.owner} onChange={(event) => setBasicInfoDraft((draft) => ({ ...draft, owner: event.target.value }))} />
	                </label>
	                <label>
	                  <span>巡检频次</span>
	                  <Input value={basicInfoDraft.frequency} onChange={(event) => setBasicInfoDraft((draft) => ({ ...draft, frequency: event.target.value }))} />
	                </label>
	                <label>
	                  <span>覆盖范围</span>
	                  <Input.TextArea rows={2} value={basicInfoDraft.range} onChange={(event) => setBasicInfoDraft((draft) => ({ ...draft, range: event.target.value }))} />
	                </label>
	                <label>
	                  <span>备注</span>
	                  <Input.TextArea rows={2} value={basicInfoDraft.remark} onChange={(event) => setBasicInfoDraft((draft) => ({ ...draft, remark: event.target.value }))} />
	                </label>
	              </div>
	            ) : (
	              <dl>
	                <div><dt>所在区域</dt><dd>{basicInfo.area}</dd></div>
	                <div><dt>所属类型</dt><dd>{basicInfo.typeLabel}</dd></div>
	                <div><dt>管理责任</dt><dd>{basicInfo.owner}</dd></div>
	                <div><dt>巡检频次</dt><dd>{basicInfo.frequency}</dd></div>
	                <div><dt>覆盖范围</dt><dd>{basicInfo.range}</dd></div>
	                <div><dt>备注</dt><dd>{basicInfo.remark}</dd></div>
	              </dl>
	            )}
	          </div>

	          <div className="archive-kpi-grid">
	            <article>
	              <span>累计问题数</span>
	              <strong>{activeItem.issueCount + 116}</strong>
              <em>同比 +12%</em>
            </article>
            <article className="warning">
              <span>待整改数</span>
              <strong>{pendingCount}</strong>
              <em>较上周 +{Math.min(5, pendingCount)}</em>
            </article>
            <article className="success">
              <span>已整改数</span>
              <strong>{fixedCount + 100}</strong>
              <em>较上周 +7</em>
            </article>
            <article>
	              <span>最近巡检时间</span>
	              <strong>07-03 09:45</strong>
	              <em>巡检人：无人机 Dock</em>
	            </article>
	            <article>
	              <span>关联报告</span>
	              <strong>{activeItem.reportCount}</strong>
	              <em>已归档至报告管理</em>
	            </article>
	          </div>
	        </section>

	        <section className="archive-photo-wall">
	          <div className="archive-section-head">
	            <div>
	              <h3>{meta.photoTitle}</h3>
	              <span>来自媒体库推送</span>
	            </div>
	            <div className="archive-filter-tabs">
	              <button className="active" type="button">全部 {linkedMediaItems.length}</button>
	              <button type="button">待整改 {pendingCount}</button>
	              <button type="button">已整改 {fixedCount}</button>
	            </div>
	            <Button icon={<UploadCloud size={15} />} onClick={() => setMediaModalOpen(true)}>从媒体库推送</Button>
	          </div>
	          {linkedMediaItems.length ? (
	            <div className="archive-photo-grid">
	              {linkedMediaItems.map((photo) => (
	                <article className="archive-photo-card" key={photo.id}>
	                  <div className="archive-photo-visual">
	                    <img className="archive-photo-media-image" src={photo.thumbnailUrl} alt={photo.title} />
	                    <span className={`photo-status ${statusTone(photo.status)}`}>{photo.status}</span>
	                    <em>{photo.capturedAt.slice(5, 16)}</em>
	                  </div>
	                  <strong>{photo.issueTitle}</strong>
	                  <span className="archive-photo-source">{photo.sourceName} / {photo.fileName}</span>
	                </article>
	              ))}
	            </div>
	          ) : (
	            <div className="archive-photo-empty">
	              <Search size={20} />
	              <strong>暂无媒体库照片</strong>
	              <span>点击“从媒体库推送”，把已经上传的巡检照片关联到当前档案。</span>
	            </div>
	          )}
	          <Button className="archive-more-button" onClick={() => setMediaModalOpen(true)}>管理媒体库照片</Button>

	          <Modal
	            title={`从媒体库推送到 ${activeItem.name}`}
	            open={mediaModalOpen}
	            onCancel={() => setMediaModalOpen(false)}
	            footer={null}
	            width={760}
	          >
	            {availableMediaItems.length ? (
	              <div className="media-push-list">
	                {availableMediaItems.map((media) => (
	                  <article key={media.id}>
	                    <img src={media.thumbnailUrl} alt={media.title} />
	                    <div>
	                      <strong>{media.issueTitle}</strong>
	                      <span>{media.linkedObjectName} / {media.capturedAt} / {media.sourceName}</span>
	                      <em>{media.fileName}</em>
	                    </div>
	                    <Button
	                      type="primary"
	                      onClick={() => {
	                        setLinkedMediaIds((current) => [...current, media.id]);
	                        message.success(`${media.title} 已推送到当前档案`);
	                      }}
	                    >
	                      推送
	                    </Button>
	                  </article>
	                ))}
	              </div>
	            ) : (
	              <div className="archive-photo-empty compact">
	                <strong>暂无可推送照片</strong>
	                <span>当前媒体库照片已经全部关联到该档案。</span>
	              </div>
	            )}
	          </Modal>
	        </section>
      </div>

      <aside className="archive-right-panel">
        <section className="archive-side-card">
          <div className="archive-section-head compact">
            <div>
              <h3>问题明细</h3>
              <span>近 30 天</span>
            </div>
            <div className="archive-filter-tabs mini">
              <button className="active" type="button">全部</button>
              <button type="button">待整改</button>
              <button type="button">已整改</button>
            </div>
          </div>
          <div className="archive-issue-list">
            {issueTemplates.map((issue, index) => (
              <article key={issue.title}>
                <div>
                  <i className={issue.severity} />
                  <strong>{issue.title}</strong>
                  <span className={`issue-state ${statusTone(issue.status)}`}>{issue.status}</span>
                </div>
                <p>编号：QY2026070{index + 1} / {activeItem.name} / 巡检发现问题</p>
                <time>{issue.date}</time>
              </article>
            ))}
          </div>
          <Link className="archive-side-link" to="/issues">查看全部问题</Link>
        </section>

        <section className="archive-side-card">
          <div className="archive-section-head compact">
            <div>
              <h3>处置时间线</h3>
              <span>最新进展</span>
            </div>
          </div>
          <div className="archive-timeline">
            {timelineItems.map((item) => (
              <article className={item.tone} key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <time>{item.time}</time>
              </article>
            ))}
          </div>
          <Link className="archive-side-link" to="/audit-logs">查看全部时间线</Link>
        </section>
      </aside>
    </section>
  );
}
