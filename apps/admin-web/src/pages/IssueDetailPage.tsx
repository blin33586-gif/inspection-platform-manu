import { useMemo, useState } from "react";
import { Button, Form, Image, Input, message, Popconfirm, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useParams } from "react-router-dom";
import type {
  IssueAttachmentSummary,
  IssueRectificationRecordSummary,
  IssueStatus,
  IssueSummary,
  PageResult,
} from "@xunjianbao/shared";
import { getApiUrl, patchJsonApi, postFormApi } from "../api/client";
import { issues } from "../data";
import { ApiResourceError } from "../components/ApiResourceError";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { canCloseIssue, getIssueDetailStatusLabel, isIssueReadOnly } from "./issue-detail-presenter";

const fallbackAttachments: PageResult<IssueAttachmentSummary> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};
const fallbackRectifications: IssueRectificationRecordSummary[] = [];

function fallbackIssue(id: string | undefined): IssueSummary {
  return issues.find((item) => item.id === id) ?? issues[0];
}

function statusColor(value: IssueStatus) {
  if (value === "pending") return "orange";
  if (value === "verified" || value === "rectified") return "green";
  if (value === "ignored" || value === "archived") return "default";
  return "blue";
}

export function IssueDetailPage() {
  const { id } = useParams();
  const [form] = Form.useForm<{ description?: string; files?: UploadFile[] }>();
  const fallback = useMemo(() => fallbackIssue(id), [id]);
  const issueResource = useApiResource<IssueSummary>(`/issues/${id}`, fallback);
  const attachmentResource = useApiResource<PageResult<IssueAttachmentSummary>>(
    `/issues/${id}/attachments`,
    fallbackAttachments,
  );
  const rectificationResource = useApiResource<IssueRectificationRecordSummary[]>(
    `/issues/${id}/rectifications`,
    fallbackRectifications,
  );
  const { data: issue } = issueResource;
  const { data: attachments, loading: attachmentsLoading } = attachmentResource;
  const { data: rectifications, loading: rectificationsLoading } = rectificationResource;
  const resourceError = issueResource.error ?? attachmentResource.error ?? rectificationResource.error;
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const readOnly = isIssueReadOnly(issue.status);
  const closeAllowed = canCloseIssue(issue.status, rectifications.length);

  const reloadAllResources = () => {
    issueResource.reload();
    attachmentResource.reload();
    rectificationResource.reload();
  };

  const submitRectification = async () => {
    if (!id) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const files = values.files?.flatMap((file) => file.originFileObj ? [file.originFileObj] : []) ?? [];
    if (files.length === 0) {
      message.warning("请至少选择 1 张整改照片");
      return;
    }

    const formData = new FormData();
    formData.append("description", values.description?.trim() ?? "");
    files.forEach((file) => formData.append("files", file));

    setSubmitting(true);
    try {
      await postFormApi<IssueRectificationRecordSummary>(`/issues/${id}/rectifications`, formData);
      message.success("整改记录已提交");
      form.resetFields();
      rectificationResource.reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "整改记录提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const closeIssue = async () => {
    if (!id || !closeAllowed) return;
    setClosing(true);
    try {
      await patchJsonApi<IssueSummary>(`/issues/${id}/close`, {});
      message.success("问题已确认闭环");
      reloadAllResources();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "确认闭环失败");
    } finally {
      setClosing(false);
    }
  };

  const attachmentColumns: ColumnsType<IssueAttachmentSummary> = [
    { title: "类型", dataIndex: "attachmentType", render: (value: string) => <Tag color="blue">{value}</Tag> },
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

  if (resourceError) return <ApiResourceError error={resourceError} onRetry={reloadAllResources} />;

  return (
    <>
      <PageHeader title={issue.title} actions={<Button href="/issues">返回问题库</Button>} />

      <section className="content-section issue-detail-page">
        <article className="issue-detail-overview">
          <div>
            <div className="issue-detail-overview-title">
              <Tag color={statusColor(issue.status)}>{getIssueDetailStatusLabel(issue.status)}</Tag>
              <strong>{issue.objectName}</strong>
            </div>
            <dl className="issue-detail-meta">
              <div><dt>关联对象</dt><dd>{issue.objectName}</dd></div>
              <div><dt>问题类型</dt><dd>{issue.category}</dd></div>
              <div><dt>严重程度</dt><dd>{issue.severity}</dd></div>
              <div><dt>发现时间</dt><dd>{new Date(issue.foundAt).toLocaleString()}</dd></div>
            </dl>
          </div>
          <div className="issue-detail-close-action">
            <Popconfirm
              title="确认闭环该问题？"
              description="闭环后将锁定整改记录，请确认已完成复核。"
              okText="确认闭环"
              cancelText="取消"
              disabled={!closeAllowed}
              onConfirm={() => void closeIssue()}
            >
              <span title={!closeAllowed && rectifications.length === 0 ? "请先提交至少一条整改记录" : undefined}>
                <Button type="primary" disabled={!closeAllowed} loading={closing}>确认闭环</Button>
              </span>
            </Popconfirm>
          </div>
        </article>

        <article className="issue-detail-panel issue-detail-attachments">
          <div className="issue-detail-section-head">
            <div><h3>原始现场资料</h3><p>保留问题发现时的照片与附件</p></div>
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

        <article className="issue-detail-panel">
          <div className="issue-detail-section-head">
            <div><h3>整改记录</h3><p>按时间保留整改说明和现场照片</p></div>
            <span>{rectifications.length} 条记录</span>
          </div>

          {readOnly ? <div className="issue-detail-locked">该问题已闭环，整改记录已锁定</div> : (
            <Form form={form} layout="vertical" className="rectification-form">
              <Form.Item name="description" label="整改说明" rules={[{ required: true, whitespace: true, message: "请填写整改说明" }]}>
                <Input.TextArea rows={3} maxLength={500} showCount placeholder="说明采取的整改措施和完成情况" />
              </Form.Item>
              <Form.Item
                name="files"
                label="整改照片"
                valuePropName="fileList"
                getValueFromEvent={(event: { fileList?: UploadFile[] }) => event.fileList ?? []}
                rules={[{ required: true, message: "请至少选择 1 张整改照片" }]}
              >
                <Upload accept=".png,.jpg,.jpeg,.webp" beforeUpload={() => false} multiple maxCount={6} listType="picture-card">
                  <span>选择照片</span>
                </Upload>
              </Form.Item>
              <Button type="primary" loading={submitting} onClick={() => void submitRectification()}>提交整改记录</Button>
            </Form>
          )}

          <div className="rectification-feed" aria-busy={rectificationsLoading}>
            {rectifications.map((record) => (
              <section className="rectification-record" key={record.id}>
                <header>
                  <strong>{record.createdBy}</strong>
                  <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time>
                </header>
                <p>{record.description}</p>
                <Image.PreviewGroup>
                  <div className="rectification-photo-grid">
                    {record.photos.map((photo) => (
                      <Image
                        key={photo.id}
                        src={getApiUrl(photo.imageUrl)}
                        alt={photo.originalFileName}
                        preview={{ src: getApiUrl(photo.imageUrl) }}
                      />
                    ))}
                  </div>
                </Image.PreviewGroup>
              </section>
            ))}
            {!rectificationsLoading && rectifications.length === 0 ? <p className="rectification-empty">暂无整改记录</p> : null}
          </div>
        </article>
      </section>
    </>
  );
}
