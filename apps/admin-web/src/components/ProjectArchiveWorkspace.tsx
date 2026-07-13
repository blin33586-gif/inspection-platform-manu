import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, message, Spin } from "antd";
import { Download, Pencil, Printer, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ManagedObjectArchiveOverview } from "@xunjianbao/shared";
import { getApi, getApiUrl, patchJsonApi, postJsonApi } from "../api/client";
import { canModifyProject } from "../auth/project-access";
import { getCurrentProject, getUser } from "../auth/session";
import {
  isArchiveMediaRequestCurrent,
  toProjectArchiveMediaItem,
  type ArchiveTaskPhotoRecord,
  type ProjectArchiveMediaItem,
} from "./project-archive-media-adapter";
import {
  filterArchiveIssues,
  formatArchiveDateTime,
  formatLatestInspectionTime,
  issueSeverityTone,
  type ArchiveIssueFilter,
} from "./project-archive-overview-presenter";

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
}> = {
  community: {
    archiveTitle: "小区综合档案",
    badge: "小区档案",
    navTitle: "小区档案",
    area: "上海市虹口区 / 曲阳路街道 / 居住小区",
    owner: "曲阳路街道城运中心、居委协同",
    frequency: "每周 2 次",
    range: "小区出入口、楼栋外立面、车棚、公共通道",
  },
  road: {
    archiveTitle: "道路街面档案",
    badge: "道路街面",
    navTitle: "街道档案",
    area: "上海市虹口区 / 曲阳路街道 / 沿街区域",
    owner: "曲阳路街道综合行政执法队",
    frequency: "每日 2 次",
    range: "沿街商铺、广告牌、占道经营、非机动车停放",
  },
  point: {
    archiveTitle: "重点点位档案",
    badge: "重点点位",
    navTitle: "重点点位",
    area: "上海市虹口区 / 曲阳路街道 / 重点设施点位",
    owner: "曲阳路街道巡检专班",
    frequency: "按专项任务复查",
    range: "广告牌、河道绿化、重点设施、反复问题点",
  },
};

const jinshanArchiveMeta: typeof archiveMeta = {
  community: {
    archiveTitle: "企业安全档案",
    badge: "企业档案",
    navTitle: "企业档案",
    area: "上海市金山区 / 化工园区 / 入园企业",
    owner: "园区安全管理部门、企业安全负责人",
    frequency: "按企业风险等级巡检",
    range: "企业厂区、生产装置、仓储区域、消防通道",
  },
  road: {
    archiveTitle: "园区道路档案",
    badge: "道路档案",
    navTitle: "道路档案",
    area: "上海市金山区 / 化工园区 / 园区道路",
    owner: "园区综合管理部门",
    frequency: "每日巡检",
    range: "园区道路、危化品运输通道、道路设施",
  },
  point: {
    archiveTitle: "园区河道档案",
    badge: "河道档案",
    navTitle: "河道档案",
    area: "上海市金山区 / 化工园区 / 河道水系",
    owner: "园区环保与水务管理部门",
    frequency: "按周巡检",
    range: "园区河道、排口、岸线及周边环境",
  },
};

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

interface ArchiveTaskPhotoPage {
  items: ArchiveTaskPhotoRecord[];
  page: number;
  pageSize: number;
  total: number;
}

async function loadArchiveMediaItems(path: string, signal?: AbortSignal) {
  const records: ArchiveTaskPhotoRecord[] = [];
  let page = 1;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const result = await getApi<ArchiveTaskPhotoPage>(`${path}${separator}page=${page}&pageSize=100`, signal);
    records.push(...result.items);
    if (records.length >= result.total || result.items.length === 0) break;
    page += 1;
  }
  return records.map((photo) => toProjectArchiveMediaItem(
    photo,
    getApiUrl(`/media-assets/${photo.mediaAsset.id}/content`),
  ));
}

export function ProjectArchiveWorkspace({ activeItem, items, projectGroups, variant }: ProjectArchiveWorkspaceProps) {
  const project = getCurrentProject();
  const user = getUser();
  const canModify = canModifyProject(user?.role);
  const meta = (project?.id === "jinshan" ? jinshanArchiveMeta : archiveMeta)[variant];
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
  const [overview, setOverview] = useState<ManagedObjectArchiveOverview | null>(null);
  const [issueFilter, setIssueFilter] = useState<ArchiveIssueFilter>("all");
  const [linkedMediaItems, setLinkedMediaItems] = useState<ProjectArchiveMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [unlinkingPhotoId, setUnlinkingPhotoId] = useState<string | null>(null);
  const [requestingDeleteId, setRequestingDeleteId] = useState<string | null>(null);
  const activeObjectIdRef = useRef<string | null>(activeItem?.id ?? null);
  const linkedMediaRequestRef = useRef(0);
  activeObjectIdRef.current = activeItem?.id ?? null;
  const [basicInfo, setBasicInfo] = useState<BasicInfoDraft>(() => buildBasicInfo(meta, activeItem));
  const [basicInfoDraft, setBasicInfoDraft] = useState<BasicInfoDraft>(() => buildBasicInfo(meta, activeItem));
  const visibleProjectGroups = projectGroups ?? [{
    key: variant,
    label: meta.navTitle,
    path: `/${variant === "community" ? "communities" : variant === "road" ? "roads" : "points"}`,
    items,
  }];
  const refreshLinkedMedia = useCallback(async (objectId: string, signal?: AbortSignal) => {
    const requestId = ++linkedMediaRequestRef.current;
    const photos = await loadArchiveMediaItems(
      `/managed-objects/${encodeURIComponent(objectId)}/photos`,
      signal,
    );
    if (isArchiveMediaRequestCurrent(
      requestId,
      linkedMediaRequestRef.current,
      objectId,
      activeObjectIdRef.current,
    )) {
      setLinkedMediaItems(photos);
    }
  }, []);

  useEffect(() => {
    const nextBasicInfo = buildBasicInfo(meta, activeItem);
    setBasicInfo(nextBasicInfo);
    setBasicInfoDraft(nextBasicInfo);
    setIsEditingBasicInfo(false);
  }, [activeItem?.id, activeItem?.relatedName, activeItem?.typeLabel, meta]);

  useEffect(() => {
    linkedMediaRequestRef.current += 1;
    setLinkedMediaItems([]);
    if (!activeItem) {
      return;
    }
    const objectId = activeItem.id;
    const controller = new AbortController();
    setMediaLoading(true);
    void refreshLinkedMedia(objectId, controller.signal)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        message.error(error instanceof Error ? error.message : "档案照片读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMediaLoading(false);
      });
    return () => controller.abort();
  }, [activeItem?.id, refreshLinkedMedia]);

  useEffect(() => {
    setOverview(null);
    setIssueFilter("all");
    if (!activeItem) return;
    const controller = new AbortController();
    void getApi<ManagedObjectArchiveOverview>(
      `/managed-objects/${encodeURIComponent(activeItem.id)}/archive-overview`,
      controller.signal,
    )
      .then(setOverview)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        message.error(error instanceof Error ? error.message : "档案概览读取失败");
      });
    return () => controller.abort();
  }, [activeItem?.id]);

  const requestArchiveDeletion = async (item: ProjectArchiveItem) => {
    setRequestingDeleteId(item.id);
    try {
      await postJsonApi(`/managed-objects/${encodeURIComponent(item.id)}/deletion-requests`, {});
      message.success("删除申请已提交，请到操作日志确认");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除申请提交失败");
    } finally {
      setRequestingDeleteId(null);
    }
  };

  const unlinkPhoto = async (photo: ProjectArchiveMediaItem) => {
    if (!activeItem) return;
    setUnlinkingPhotoId(photo.taskPhotoId);
    try {
      await patchJsonApi(
        `/inspection-tasks/${encodeURIComponent(photo.taskId)}/photos/${encodeURIComponent(photo.taskPhotoId)}/distribution`,
        { action: "unarchive" },
      );
      await refreshLinkedMedia(activeItem.id);
      message.success("已解除照片与档案的关联，原始照片保留在任务库");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "解除关联失败");
    } finally {
      setUnlinkingPhotoId(null);
    }
  };

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
            <summary>{project?.shortName ?? "当前项目"}</summary>
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
                        {canModify ? <div className="archive-tree-actions">
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
                              void requestArchiveDeletion(item);
                            }}
                          >
                            {requestingDeleteId === item.id ? "提交中" : "删除"}
                          </button>
                        </div> : null}
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
            {canModify ? <Button
	              icon={<Pencil size={15} />}
	              onClick={() => {
	                setBasicInfoDraft(basicInfo);
	                setIsEditingBasicInfo(true);
	              }}
            >
	              编辑档案
	            </Button> : null}
            {canModify ? <Button danger loading={requestingDeleteId === activeItem.id} icon={<Trash2 size={15} />} onClick={() => void requestArchiveDeletion(activeItem)}>删除</Button> : null}
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
	              {canModify && isEditingBasicInfo ? (
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
	              ) : canModify ? (
	                <Button size="small" icon={<Pencil size={13} />} onClick={() => setIsEditingBasicInfo(true)}>
	                  编辑
	                </Button>
	              ) : null}
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
	              <strong>{overview?.totalIssues ?? 0}</strong>
              <em>来自当前项目问题库</em>
            </article>
            <article className="warning">
              <span>待整改数</span>
              <strong>{overview?.openIssues ?? 0}</strong>
              <em>尚未闭环</em>
            </article>
            <article className="success">
              <span>已完成数</span>
              <strong>{overview?.completedIssues ?? 0}</strong>
              <em>已完成处置</em>
            </article>
            <article>
	              <span>最近巡检时间</span>
	              <strong>{formatLatestInspectionTime(overview?.latestInspectionAt ?? null)}</strong>
	              <em>{overview?.latestInspectionSource ? `来源：${overview.latestInspectionSource}` : "暂无巡检记录"}</em>
	            </article>
	            <article>
	              <span>关联报告</span>
	              <strong>{overview?.reportCount ?? 0}</strong>
	              <em>已归档至报告管理</em>
	            </article>
	          </div>
	        </section>

	        <section className="archive-photo-wall">
	          <div className="archive-section-head">
	            <div>
	              <h3>照片墙</h3>
	              <span>来自任务库归档</span>
	            </div>
	          </div>
	          {mediaLoading ? (
	            <div className="archive-photo-empty">
	              <Spin />
	              <strong>正在读取档案照片</strong>
	            </div>
	          ) : linkedMediaItems.length ? (
	            <div className="archive-photo-grid">
	              {linkedMediaItems.map((photo) => (
	                <article className="archive-photo-card" key={photo.id}>
	                  <div className="archive-photo-visual">
	                    <img className="archive-photo-media-image" src={photo.thumbnailUrl} alt={photo.title} />
	                    <span className={`photo-status ${statusTone(photo.status)}`}>{photo.status}</span>
	                    <em>{photo.capturedAt.startsWith("视频 ") ? photo.capturedAt : photo.capturedAt.slice(5, 16)}</em>
	                    {canModify ? <Button
	                      className="archive-photo-unlink"
	                      danger
	                      size="small"
	                      loading={unlinkingPhotoId === photo.taskPhotoId}
	                      icon={<Trash2 size={14} />}
	                      onClick={() => void unlinkPhoto(photo)}
	                    >
	                      解除关联
	                    </Button> : null}
	                  </div>
	                  <strong>{photo.issueTitle}</strong>
	                  <span className="archive-photo-source">{photo.sourceName} / {photo.fileName}</span>
	                </article>
	              ))}
	            </div>
	          ) : (
	            <div className="archive-photo-empty">
	              <Search size={20} />
	              <strong>暂无归档照片</strong>
	              <span>在任务库中分发照片后，会自动显示在当前档案。</span>
	            </div>
	          )}
	        </section>
      </div>

      <aside className="archive-right-panel">
        <section className="archive-side-card">
          <div className="archive-section-head compact">
            <div>
              <h3>问题明细</h3>
              <span>当前档案真实数据</span>
            </div>
            <div className="archive-filter-tabs mini">
              <button className={issueFilter === "all" ? "active" : ""} type="button" onClick={() => setIssueFilter("all")}>全部</button>
              <button className={issueFilter === "open" ? "active" : ""} type="button" onClick={() => setIssueFilter("open")}>未闭环</button>
              <button className={issueFilter === "completed" ? "active" : ""} type="button" onClick={() => setIssueFilter("completed")}>已完成</button>
            </div>
          </div>
          <div className="archive-issue-list">
            {filterArchiveIssues(overview?.issues ?? [], issueFilter).map((issue) => (
              <article key={issue.id}>
                <div>
                  <i className={issueSeverityTone(issue.severity)} />
                  <Link to={`/issues/${issue.id}`}><strong>{issue.title}</strong></Link>
                  <span className={`issue-state ${issue.state === "open" ? "warning" : "success"}`}>{issue.stateLabel}</span>
                </div>
                <p>编号：{issue.id} / {activeItem.name} / {issue.category}</p>
                <time>{formatArchiveDateTime(issue.foundAt)} · {issue.sourceLabel}</time>
              </article>
            ))}
            {overview && filterArchiveIssues(overview.issues, issueFilter).length === 0 ? (
              <div className="archive-tree-empty">当前筛选下暂无问题</div>
            ) : null}
          </div>
          <Link className="archive-side-link" to="/issues">查看全部问题</Link>
        </section>
      </aside>
    </section>
  );
}
