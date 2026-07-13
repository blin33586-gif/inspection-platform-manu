import { useState } from "react";
import { Button, Input, message, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { AuditLogSummary, PageResult } from "@xunjianbao/shared";
import { patchJsonApi, withQuery } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackAuditLogs: PageResult<AuditLogSummary> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

export function AuditLogsPage() {
  const [keyword, setKeyword] = useState("");
  const [action, setAction] = useState<string | undefined>();
  const [targetType, setTargetType] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const { data, loading, error, reload } = useApiResource(withQuery("/audit-logs", { keyword, action, targetType, page, pageSize }), fallbackAuditLogs);

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  const searchKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
  };

  const changeAction = (value: string | undefined) => {
    setAction(value);
    setPage(1);
  };

  const changeTargetType = (value: string | undefined) => {
    setTargetType(value);
    setPage(1);
  };

  const reviewDeletion = async (id: string, decision: "confirm" | "cancel") => {
    setReviewingId(id);
    try {
      await patchJsonApi(`/audit-logs/${encodeURIComponent(id)}/review`, { decision });
      message.success(decision === "confirm" ? "档案已删除，关联照片已返回任务库" : "删除申请已取消");
      reload();
    } catch (reviewError) {
      message.error(reviewError instanceof Error ? reviewError.message : "审批失败");
    } finally {
      setReviewingId(null);
    }
  };

  const columns: ColumnsType<AuditLogSummary> = [
    { title: "时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString() },
    { title: "操作人", dataIndex: "actor" },
    {
      title: "动作",
      dataIndex: "action",
      render: (value: string) => <Tag color={value === "managedObject.delete.request" ? "orange" : "blue"}>{value === "managedObject.delete.request" ? "档案删除申请" : value}</Tag>,
    },
    { title: "对象", dataIndex: "targetType" },
    { title: "说明", dataIndex: "summary" },
    {
      title: "审批",
      render: (_, record) => {
        if (record.action !== "managedObject.delete.request") return "-";
        if (record.reviewStatus !== "pending") {
          return <Tag color={record.reviewStatus === "confirmed" ? "green" : "default"}>{record.reviewStatus === "confirmed" ? "已确认删除" : "已取消"}</Tag>;
        }
        return (
          <Space>
            <Button danger size="small" loading={reviewingId === record.id} onClick={() => void reviewDeletion(record.id, "confirm")}>确认删除</Button>
            <Button size="small" disabled={reviewingId === record.id} onClick={() => void reviewDeletion(record.id, "cancel")}>取消申请</Button>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader eyebrow="OPERATION LOGS" title="操作日志" />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">RECENT ACTIVITIES</p>
            <h3>最近操作记录</h3>
          </div>
          <div className="filter-controls audit-filter-controls">
            <Input.Search
              placeholder="搜索人员、动作、说明"
              allowClear
              onSearch={searchKeyword}
              onChange={(event) => !event.target.value && searchKeyword("")}
            />
            <Select
              allowClear
              placeholder="动作"
              value={action}
              onChange={changeAction}
              options={[
                { label: "状态变更", value: "issue.status.update" },
                { label: "上传报告", value: "report.upload" },
                { label: "上传地图", value: "map.upload" },
                { label: "新增热区", value: "map.hot_area.create" },
                { label: "档案删除申请", value: "managedObject.delete.request" },
              ]}
            />
            <Select
              allowClear
              placeholder="对象"
              value={targetType}
              onChange={changeTargetType}
              options={[
                { label: "问题", value: "issue" },
                { label: "报告", value: "report" },
                { label: "地图", value: "map_asset" },
                { label: "热区", value: "map_hot_area" },
                { label: "小区档案", value: "community" },
                { label: "道路档案", value: "road" },
                { label: "重点点位档案", value: "point" },
              ]}
            />
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data.items}
          loading={loading}
          pagination={{
            current: data.page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          className="data-table"
        />
      </section>
    </>
  );
}
