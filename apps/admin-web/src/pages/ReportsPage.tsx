import { useState } from "react";
import { Button, DatePicker, Form, Input, InputNumber, message, Modal, Pagination, Select, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { PageResult, ReportSummary, ReportType } from "@xunjianbao/shared";
import { getApiUrl, postFormApi, withQuery } from "../api/client";
import { reports } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackReports: PageResult<ReportSummary> = {
  items: reports,
  page: 1,
  pageSize: 20,
  total: reports.length,
};

export function ReportsPage() {
  const [form] = Form.useForm<{
    title?: string;
    reportDate?: { format: (format: string) => string };
    reportType?: string;
    relatedObjectName?: string;
    issueCount?: number;
    contentSummary?: string;
    file?: UploadFile[];
  }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [filterReportType, setFilterReportType] = useState<ReportType | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, reload } = useApiResource(withQuery("/reports", { keyword, reportType: filterReportType, page, pageSize }), fallbackReports);

  const searchKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
  };

  const changeReportType = (value: ReportType | undefined) => {
    setFilterReportType(value);
    setPage(1);
  };

  const submitUpload = async () => {
    const values = await form.validateFields();
    const uploadFile = values.file?.[0]?.originFileObj;
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (values.title) formData.append("title", values.title);
    if (values.reportDate) formData.append("reportDate", values.reportDate.format("YYYY-MM-DD"));
    if (values.reportType) formData.append("reportType", values.reportType);
    if (values.relatedObjectName) formData.append("relatedObjectName", values.relatedObjectName);
    if (values.issueCount !== undefined) formData.append("issueCount", String(values.issueCount));
    if (values.contentSummary) formData.append("contentSummary", values.contentSummary);

    setSubmitting(true);
    try {
      await postFormApi<ReportSummary>("/reports/upload", formData);
      message.success("报告已上传");
      form.resetFields();
      setOpen(false);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="REPORT CENTER" title="巡检报告" actions={<Button type="primary" onClick={() => setOpen(true)}>上传报告</Button>} />
      <section className="content-section split-section">
        <article>
          <div className="section-head">
            <div>
              <p className="eyebrow">REPORT LIST</p>
              <h3>最新报告</h3>
            </div>
            <div className="filter-controls">
              <Input.Search
                placeholder="搜索标题、对象、摘要"
                allowClear
                onSearch={searchKeyword}
                onChange={(event) => !event.target.value && searchKeyword("")}
              />
              <Select
                allowClear
                placeholder="报告类型"
                value={filterReportType}
                onChange={changeReportType}
                options={[
                  { label: "小区巡检", value: "community" },
                  { label: "道路巡检", value: "road" },
                  { label: "重点点位", value: "point" },
                  { label: "综合报告", value: "comprehensive" },
                ]}
              />
            </div>
          </div>
          <div className="report-list">
            {data.items.map((report) => (
              <article className="report-item" key={report.id}>
                <span>{report.reportDate.slice(5)}</span>
                <strong>{report.title}</strong>
                <em>{report.relatedObjectName} / {report.issueCount} 个问题 / {report.processStatus === "uploaded" ? "已上传" : "已归档"}</em>
                {report.fileName ? <a className="download-link" href={getApiUrl(`/reports/${report.id}/file`)}>下载文件</a> : null}
              </article>
            ))}
          </div>
          <Pagination
            className="list-pagination"
            current={data.page}
            pageSize={data.pageSize}
            total={data.total}
            showSizeChanger
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }}
          />
        </article>
        <article className="report-preview">
          <div className="section-head">
            <div>
              <p className="eyebrow">REPORT PREVIEW</p>
              <h3>报告预览</h3>
            </div>
          </div>
          <div className="pdf-card">
            <span>PDF</span>
            <strong>玉田新村飞线与堆物巡检报告</strong>
            <p>报告摘要、关联问题、现场照片和复查建议会在这里集中展示。</p>
          </div>
        </article>
      </section>

      <Modal
        title="上传巡检报告"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitUpload}
        confirmLoading={submitting}
        okText="上传"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="报告标题">
            <Input placeholder="例如：玉田新村飞线与堆物巡检报告" />
          </Form.Item>
          <Form.Item name="reportDate" label="巡检日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reportType" label="报告类型">
            <Select
              options={[
                { label: "小区巡检", value: "community" },
                { label: "道路巡检", value: "road" },
                { label: "重点点位", value: "point" },
                { label: "综合报告", value: "comprehensive" },
              ]}
              placeholder="请选择报告类型"
            />
          </Form.Item>
          <Form.Item name="relatedObjectName" label="关联对象">
            <Input placeholder="例如：玉田新村、曲阳路" />
          </Form.Item>
          <Form.Item name="issueCount" label="关联问题数">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="contentSummary" label="报告摘要">
            <Input.TextArea rows={3} placeholder="可填写巡检重点、发现问题和复查建议" />
          </Form.Item>
          <Form.Item
            name="file"
            label="报告文件"
            valuePropName="fileList"
            getValueFromEvent={(event: { fileList?: UploadFile[] }) => event.fileList ?? []}
            rules={[{ required: true, message: "请选择报告文件" }]}
          >
            <Upload accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" beforeUpload={() => false} maxCount={1}>
              <Button>选择文件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
