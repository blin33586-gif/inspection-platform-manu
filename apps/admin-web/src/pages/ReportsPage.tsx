import { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { Download, Eye, FileDown, FilePenLine, MoreHorizontal, UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import type { PageResult, ReportSummary, ReportType } from "@xunjianbao/shared";
import { getApiUrl, postFormApi, withQuery } from "../api/client";
import { reports } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { readSubmittedReports } from "../utils/reportDraftStore";

const fallbackReports: PageResult<ReportSummary> = {
  items: reports,
  page: 1,
  pageSize: 20,
  total: reports.length,
};

const reportTypeOptions: { label: string; value: ReportType }[] = [
  { label: "小区巡检", value: "community" },
  { label: "道路巡检", value: "road" },
  { label: "重点点位", value: "point" },
  { label: "综合报告", value: "comprehensive" },
];

const reportTypeLabels: Record<ReportType, string> = {
  community: "小区",
  road: "道路",
  point: "点位",
  comprehensive: "综合",
};

const generatedTimes = ["14:30", "16:45", "10:20", "15:10", "11:05", "09:50"];

function getMonthDay(date: string) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${month}月${day}日`;
}

function getReportStatus(report: ReportSummary) {
  if (report.processStatus === "processing") return { key: "processing", label: "生成中", color: "blue" };
  if (report.processStatus === "failed") return { key: "failed", label: "生成失败", color: "red" };
  return { key: "completed", label: "已完成", color: "green" };
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

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
  const [draftKeyword, setDraftKeyword] = useState("");
  const [filterReportType, setFilterReportType] = useState<ReportType | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [localReports, setLocalReports] = useState<ReportSummary[]>(() => readSubmittedReports());
  const { data, reload } = useApiResource(withQuery("/reports", { keyword, reportType: filterReportType, page, pageSize }), fallbackReports);

  useEffect(() => {
    const refreshSubmittedReports = () => setLocalReports(readSubmittedReports());

    window.addEventListener("focus", refreshSubmittedReports);
    window.addEventListener("storage", refreshSubmittedReports);

    return () => {
      window.removeEventListener("focus", refreshSubmittedReports);
      window.removeEventListener("storage", refreshSubmittedReports);
    };
  }, []);

  const reportItems = useMemo(() => {
    const localReportIds = new Set(localReports.map((report) => report.id));

    return [
      ...localReports,
      ...data.items.filter((report) => !localReportIds.has(report.id)),
    ];
  }, [data.items, localReports]);

  const applyFilters = () => {
    setKeyword(draftKeyword.trim());
    setPage(1);
  };

  const changeReportType = (value: ReportType | undefined) => {
    setFilterReportType(value);
    setPage(1);
  };

  const resetFilters = () => {
    setDraftKeyword("");
    setKeyword("");
    setFilterReportType(undefined);
    setStatusFilter(undefined);
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const visibleReports = reportItems.filter((report) => {
    const status = getReportStatus(report).key;
    const normalizedKeyword = keyword.trim().toLowerCase();
    const matchesKeyword = !normalizedKeyword
      || report.title.toLowerCase().includes(normalizedKeyword)
      || report.relatedObjectName.toLowerCase().includes(normalizedKeyword);
    const matchesReportType = !filterReportType || report.reportType === filterReportType;
    const matchesStatus = !statusFilter || status === statusFilter;
    const matchesStartDate = !startDate || report.reportDate >= startDate;
    const matchesEndDate = !endDate || report.reportDate <= endDate;

    return matchesKeyword && matchesReportType && matchesStatus && matchesStartDate && matchesEndDate;
  });

  const exportReports = () => {
    const header = ["报告名称", "所属任务", "巡检区域", "巡检日期", "生成时间", "状态", "问题数"];
    const rows = visibleReports.map((report, index) => {
      const status = getReportStatus(report);
      const taskName = `${reportTypeLabels[report.reportType]}巡检-${getMonthDay(report.reportDate)}`;

      return [
        report.title,
        taskName,
        report.relatedObjectName,
        report.reportDate,
        `${report.reportDate} ${generatedTimes[index % generatedTimes.length]}`,
        status.label,
        report.issueCount,
      ];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `巡检报告_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success("已导出当前筛选结果");
  };

  const columns: ColumnsType<ReportSummary> = [
    {
      title: "报告封面",
      dataIndex: "reportType",
      width: 118,
      render: (reportType: ReportType) => (
        <div className={`report-cover-thumb report-cover-${reportType}`}>
          <span>{reportTypeLabels[reportType]}</span>
        </div>
      ),
    },
    {
      title: "报告名称",
      dataIndex: "title",
      width: 230,
      render: (title: string, report) => (
        <div className="report-title-cell">
          <Link className="text-link compact-link" to={`/reports/${report.id}`}>{title}</Link>
          <span>{report.reportDate}</span>
        </div>
      ),
    },
    {
      title: "所属任务",
      dataIndex: "reportType",
      width: 190,
      render: (reportType: ReportType, report) => `${reportTypeLabels[reportType]}巡检-${getMonthDay(report.reportDate)}`,
    },
    {
      title: "巡检区域",
      dataIndex: "relatedObjectName",
      width: 150,
    },
    {
      title: "巡检日期",
      dataIndex: "reportDate",
      width: 128,
    },
    {
      title: "生成时间",
      dataIndex: "reportDate",
      width: 158,
      render: (reportDate: string, _report, index) => `${reportDate} ${generatedTimes[index % generatedTimes.length]}`,
    },
    {
      title: "状态",
      dataIndex: "processStatus",
      width: 112,
      render: (_status, report) => {
        const status = getReportStatus(report);

        return <Tag color={status.color}>{status.label}</Tag>;
      },
    },
    {
      title: "操作",
      dataIndex: "id",
      fixed: "right",
      width: 228,
      render: (_id, report) => (
        <Space className="report-row-actions" size={8}>
          <Button size="small" icon={<Eye size={14} />} href={`/reports/${report.id}`}>预览</Button>
          {report.fileName ? (
            <Button size="small" icon={<Download size={14} />} href={getApiUrl(`/reports/${report.id}/file`)}>下载</Button>
          ) : (
            <Button size="small" icon={<Download size={14} />} onClick={() => message.info("该报告暂无附件，上传文件后可下载")}>下载</Button>
          )}
          <Button size="small" icon={<MoreHorizontal size={14} />} onClick={() => message.info("更多操作将接入归档、复查单和分享链接")}>更多</Button>
        </Space>
      ),
    },
  ];

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
      <PageHeader
        title="报告管理"
        description="查看、管理和导出无人机巡检报告"
        actions={(
          <Space className="report-header-actions" size={12}>
            <Button type="primary" icon={<UploadCloud size={16} />} onClick={() => setOpen(true)}>上传报告</Button>
            <Button className="write-report-entry" icon={<FilePenLine size={16} />} href="/reports/write">写报告</Button>
          </Space>
        )}
      />
      <section className="content-section report-management-section">
        <div className="report-filter-panel">
          <label className="report-filter-field report-date-field">
            <span>报告日期</span>
            <div className="report-date-range">
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              <em>至</em>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </label>
          <label className="report-filter-field">
            <span>报告名称</span>
            <Input.Search
              className="report-name-search"
              placeholder="请输入报告名称"
              allowClear
              value={draftKeyword}
              onChange={(event) => {
                setDraftKeyword(event.target.value);
                if (!event.target.value) setKeyword("");
              }}
              onSearch={applyFilters}
            />
          </label>
          <label className="report-filter-field">
            <span>所属任务</span>
            <Select
              allowClear
              placeholder="全部任务"
              value={filterReportType}
              onChange={changeReportType}
              options={reportTypeOptions}
            />
          </label>
          <label className="report-filter-field">
            <span>报告状态</span>
            <Select
              allowClear
              placeholder="全部状态"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              options={[
                { label: "已完成", value: "completed" },
                { label: "生成中", value: "processing" },
                { label: "生成失败", value: "failed" },
              ]}
            />
          </label>
          <div className="report-filter-actions">
            <Button type="primary" onClick={applyFilters}>查询</Button>
            <Button onClick={resetFilters}>重置</Button>
            <Button icon={<FileDown size={16} />} onClick={exportReports}>导出报表</Button>
          </div>
        </div>
        <Table
          className="report-management-table"
          columns={columns}
          dataSource={visibleReports}
          rowKey="id"
          scroll={{ x: 1180 }}
          pagination={{
            current: page,
            pageSize,
            total: visibleReports.length,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
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
              options={reportTypeOptions}
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
