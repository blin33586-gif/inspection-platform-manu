import { useMemo, useState } from "react";
import { Button, Form, Input, message, Select, Space, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useParams } from "react-router-dom";
import type { IssueAttachmentSummary, IssueStatus, IssueSummary, PageResult } from "@xunjianbao/shared";
import { getApiUrl, patchJsonApi, postFormApi } from "../api/client";
import { issues } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const allowedNextStatuses: Array<{ label: string; value: IssueStatus }> = [
  { label: "处理中", value: "processing" },
  { label: "已整改", value: "rectified" },
  { label: "复查通过", value: "verified" },
  { label: "忽略", value: "ignored" },
];

const fallbackAttachments: PageResult<IssueAttachmentSummary> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

function fallbackIssue(id: string | undefined): IssueSummary {
  return issues.find((item) => item.id === id) ?? issues[0];
}

function statusLabel(value: IssueStatus) {
  if (value === "pending") return "待处理";
  if (value === "processing") return "处理中";
  if (value === "rectified") return "已整改";
  if (value === "verified") return "复查通过";
  if (value === "ignored") return "忽略";
  return "归档";
}

function statusColor(value: IssueStatus) {
  if (value === "pending") return "orange";
  if (value === "verified" || value === "rectified") return "green";
  if (value === "ignored" || value === "archived") return "default";
  return "blue";
}

export function IssueDetailPage() {
  const { id } = useParams();
  const [form] = Form.useForm<{ attachmentType?: string; remark?: string; file?: UploadFile[] }>();
  const fallback = useMemo(() => fallbackIssue(id), [id]);
  const { data: issue, reload } = useApiResource<IssueSummary>(`/issues/${id}`, fallback);
  const { data: attachments, loading: attachmentsLoading, reload: reloadAttachments } = useApiResource<PageResult<IssueAttachmentSummary>>(
    `/issues/${id}/attachments`,
    fallbackAttachments,
  );
  const [updatingStatus, setUpdatingStatus] = useState<IssueStatus | null>(null);
  const [uploading, setUploading] = useState(false);

  const updateStatus = async (status: IssueStatus) => {
    if (!id) return;
    setUpdatingStatus(status);
    try {
      await patchJsonApi<IssueSummary>(`/issues/${id}/status`, { status });
      message.success("状态已更新");
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const uploadAttachment = async () => {
    if (!id) return;
    const values = await form.validateFields();
    const uploadFile = values.file?.[0]?.originFileObj;
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (values.attachmentType) formData.append("attachmentType", values.attachmentType);
    if (values.remark) formData.append("remark", values.remark);

    setUploading(true);
    try {
      await postFormApi<IssueAttachmentSummary>(`/issues/${id}/attachments`, formData);
      message.success("附件已上传");
      form.resetFields();
      reloadAttachments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const attachmentColumns: ColumnsType<IssueAttachmentSummary> = [
    { title: "类型", dataIndex: "attachmentType", render: (value: string) => <Tag color={value.includes("整改") ? "green" : "blue"}>{value}</Tag> },
    { title: "文件名", dataIndex: "originalFileName" },
    { title: "说明", dataIndex: "remark", render: (value?: string | null) => value || "-" },
    { title: "上传时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString() },
    {
      title: "操作",
      render: (_, record) => (
        <a className="table-action-link" href={getApiUrl(`/issues/attachments/${record.id}/file`)}>下载</a>
      ),
    },
  ];

  return (
    <>
      <PageHeader eyebrow="ISSUE DETAIL" title={issue.title} actions={<Button href="/issues">返回问题台账</Button>} />

      <section className="content-section">
        <div className="detail-layout">
          <article className="detail-hero">
            <div className="detail-title">
              <Tag color={statusColor(issue.status)}>{statusLabel(issue.status)}</Tag>
              <h4>{issue.objectName}</h4>
              <p>{issue.category}问题，发现时间 {issue.foundAt}。后续可继续补现场照片、处置说明、复查记录和责任单位。</p>
            </div>
            <div className="detail-kpis">
              <div><span>问题类型</span><strong>{issue.category}</strong></div>
              <div><span>严重程度</span><strong>{issue.severity}</strong></div>
              <div><span>当前状态</span><strong>{statusLabel(issue.status)}</strong></div>
              <div><span>发现日期</span><strong>{issue.foundAt.slice(5)}</strong></div>
            </div>
          </article>

          <aside className="timeline-panel">
            <h4>状态推进</h4>
            <Space direction="vertical" className="status-action-list">
              {allowedNextStatuses.map((item) => (
                <Button
                  block
                  key={item.value}
                  loading={updatingStatus === item.value}
                  onClick={() => updateStatus(item.value)}
                  type={item.value === "verified" ? "primary" : "default"}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
          </aside>
        </div>
      </section>

      <section className="content-section split-section">
        <article>
          <div className="section-head">
            <div>
              <p className="eyebrow">ATTACHMENTS</p>
              <h3>现场照片与附件</h3>
            </div>
          </div>
          <Table
            rowKey="id"
            columns={attachmentColumns}
            dataSource={attachments.items}
            loading={attachmentsLoading}
            pagination={false}
            className="data-table"
          />
        </article>

        <article>
          <div className="section-head">
            <div>
              <p className="eyebrow">UPLOAD</p>
              <h3>上传资料</h3>
            </div>
          </div>
          <Form form={form} layout="vertical" className="attachment-form" initialValues={{ attachmentType: "现场照片" }}>
            <Form.Item name="attachmentType" label="资料类型">
              <Select
                options={[
                  { label: "现场照片", value: "现场照片" },
                  { label: "整改照片", value: "整改照片" },
                  { label: "复查照片", value: "复查照片" },
                  { label: "附件", value: "附件" },
                ]}
              />
            </Form.Item>
            <Form.Item name="remark" label="说明">
              <Input.TextArea rows={3} placeholder="例如：3 号楼外立面飞线位置" />
            </Form.Item>
            <Form.Item
              name="file"
              label="文件"
              valuePropName="fileList"
              getValueFromEvent={(event: { fileList?: UploadFile[] }) => event.fileList ?? []}
              rules={[{ required: true, message: "请选择文件" }]}
            >
              <Upload accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx" beforeUpload={() => false} maxCount={1}>
                <Button>选择文件</Button>
              </Upload>
            </Form.Item>
            <Button type="primary" loading={uploading} onClick={uploadAttachment}>上传资料</Button>
          </Form>
        </article>
      </section>
    </>
  );
}
