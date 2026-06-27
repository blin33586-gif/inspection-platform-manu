import { useState } from "react";
import { Button, DatePicker, Form, Input, message, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link } from "react-router-dom";
import type { IssueStatus, IssueSummary, ManagedObjectSummary, PageResult, PointSummary, Severity } from "@xunjianbao/shared";
import { patchJsonApi, postJsonApi, withQuery } from "../api/client";
import { communities, issues, points, roads } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackIssues: PageResult<IssueSummary> = {
  items: issues,
  page: 1,
  pageSize: 20,
  total: issues.length,
};

const fallbackCommunities: PageResult<ManagedObjectSummary> = { items: communities, page: 1, pageSize: 20, total: communities.length };
const fallbackRoads: PageResult<ManagedObjectSummary> = { items: roads, page: 1, pageSize: 20, total: roads.length };
const fallbackPoints: PageResult<PointSummary> = { items: points, page: 1, pageSize: 20, total: points.length };

function statusLabel(value: IssueStatus) {
  if (value === "pending") return "待处理";
  if (value === "processing") return "处理中";
  if (value === "rectified") return "已整改";
  if (value === "verified") return "复查通过";
  if (value === "ignored") return "忽略";
  return "归档";
}

export function IssuesPage() {
  const [form] = Form.useForm<{
    title?: string;
    category?: string;
    status?: IssueStatus;
    severity?: Severity;
    foundAt?: { format: (format: string) => string };
    objectId?: string;
  }>();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<IssueStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, loading, reload } = useApiResource(withQuery("/issues", { keyword, status, page, pageSize }), fallbackIssues);
  const { data: communityData } = useApiResource("/communities", fallbackCommunities);
  const { data: roadData } = useApiResource("/roads", fallbackRoads);
  const { data: pointData } = useApiResource("/points", fallbackPoints);

  const objectOptions = [
    ...communityData.items.map((item) => ({ label: `小区 / ${item.name}`, value: item.id })),
    ...roadData.items.map((item) => ({ label: `道路 / ${item.name}`, value: item.id })),
    ...pointData.items.map((item) => ({ label: `点位 / ${item.name}`, value: item.id })),
  ];

  const searchKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
  };

  const changeStatus = (value: IssueStatus | undefined) => {
    setStatus(value);
    setPage(1);
  };

  const updateStatus = async (id: string, status: IssueStatus) => {
    setUpdatingId(id);
    try {
      await patchJsonApi<IssueSummary>(`/issues/${id}/status`, { status });
      message.success("状态已更新");
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setUpdatingId(null);
    }
  };

  const submitIssue = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await postJsonApi<IssueSummary>("/issues", {
        title: values.title,
        category: values.category,
        status: values.status,
        severity: values.severity,
        foundAt: values.foundAt?.format("YYYY-MM-DD"),
        objectId: values.objectId,
      });
      message.success("问题已新增");
      form.resetFields();
      setOpen(false);
      setPage(1);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "新增失败");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<IssueSummary> = [
    { title: "对象", dataIndex: "objectName" },
    { title: "问题", dataIndex: "title", render: (value: string, record) => <Link className="text-link compact-link" to={`/issues/${record.id}`}>{value}</Link> },
    { title: "类型", dataIndex: "category" },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: IssueStatus) => (
        <Tag color={value === "pending" ? "orange" : value === "verified" ? "green" : "blue"}>{statusLabel(value)}</Tag>
      ),
    },
    { title: "发现时间", dataIndex: "foundAt" },
    {
      title: "操作",
      render: (_, record) => (
        <Space>
          <Button size="small" loading={updatingId === record.id} onClick={() => updateStatus(record.id, "processing")}>处理中</Button>
          <Button size="small" type="primary" loading={updatingId === record.id} onClick={() => updateStatus(record.id, "verified")}>复查通过</Button>
          <Button size="small" href={`/issues/${record.id}`}>详情</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader eyebrow="ISSUE LEDGER" title="问题台账" actions={<Button type="primary" onClick={() => setOpen(true)}>新增问题</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">ALL ISSUES</p>
            <h3>重点问题列表</h3>
          </div>
          <div className="filter-controls">
            <Input.Search
              placeholder="搜索对象、问题、类型"
              allowClear
              onSearch={searchKeyword}
              onChange={(event) => !event.target.value && searchKeyword("")}
            />
            <Select
              allowClear
              placeholder="状态"
              value={status}
              onChange={changeStatus}
              options={[
                { label: "待处理", value: "pending" },
                { label: "处理中", value: "processing" },
                { label: "复查通过", value: "verified" },
                { label: "已整改", value: "rectified" },
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

      <Modal
        title="新增巡检问题"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitIssue}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ status: "pending", severity: "normal" }}>
          <Form.Item name="title" label="问题标题" rules={[{ required: true, message: "请输入问题标题" }]}>
            <Input placeholder="例如：3 号楼外立面飞线充电" />
          </Form.Item>
          <Form.Item name="category" label="问题类型" rules={[{ required: true, message: "请输入问题类型" }]}>
            <Input placeholder="例如：飞线、广告牌、占道经营、违建" />
          </Form.Item>
          <Form.Item name="objectId" label="关联对象">
            <Select showSearch allowClear placeholder="选择小区、道路或点位" optionFilterProp="label" options={objectOptions} />
          </Form.Item>
          <Form.Item name="foundAt" label="发现日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="severity" label="严重程度">
            <Select
              options={[
                { label: "普通", value: "normal" },
                { label: "中等", value: "medium" },
                { label: "高", value: "high" },
              ]}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: "待处理", value: "pending" },
                { label: "处理中", value: "processing" },
                { label: "已整改", value: "rectified" },
                { label: "复查通过", value: "verified" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
