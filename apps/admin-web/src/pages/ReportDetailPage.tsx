import { useMemo, useState } from "react";
import { Button, message } from "antd";
import { ArrowLeft, Printer } from "lucide-react";
import { useParams } from "react-router-dom";
import type { ReportSummary } from "@xunjianbao/shared";
import { downloadApiFile, getApiUrl } from "../api/client";
import { reports } from "../data";
import { ApiResourceError } from "../components/ApiResourceError";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { getReportDownloadName } from "./report-export";

function fallbackReport(id: string | undefined): ReportSummary {
  return reports.find((item) => item.id === id) ?? { ...reports[0], photos: [] };
}

function formatVideoTime(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ReportDetailPage() {
  const { id } = useParams();
  const fallback = useMemo(() => fallbackReport(id), [id]);
  const { data: report, error, reload } = useApiResource<ReportSummary>(`/reports/${id}`, fallback);
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    if (!id) return;
    setExporting(true);
    try {
      await downloadApiFile(`/reports/${id}/pdf`, getReportDownloadName(report.title));
    } catch (downloadError) {
      message.error(downloadError instanceof Error ? downloadError.message : "PDF 导出失败");
    } finally {
      setExporting(false);
    }
  }

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title={report.title}
        actions={(
          <>
            <Button href="/reports" icon={<ArrowLeft size={16} />}>返回报告库</Button>
            <Button loading={exporting} type="primary" onClick={() => void exportPdf()}>导出 PDF</Button>
            <Button icon={<Printer size={16} />} onClick={() => window.print()}>打印</Button>
          </>
        )}
      />
      <main className="html-report-document">
        <section className="html-report-cover">
          <span>巡检宝 · 综合巡检报告</span>
          <h1>{report.title}</h1>
          <dl>
            <div><dt>巡检日期</dt><dd>{report.reportDate}</dd></div>
            <div><dt>巡检区域</dt><dd>{report.relatedObjectName}</dd></div>
            <div><dt>问题数量</dt><dd>{report.issueCount}</dd></div>
            <div><dt>照片数量</dt><dd>{report.photos?.length ?? 0}</dd></div>
          </dl>
          {report.contentSummary ? <p>{report.contentSummary}</p> : null}
        </section>

        {report.photos?.map((photo, index) => {
          const visualUrl = photo.issueCardId
            ? getApiUrl(`/issues/${photo.issueCardId}/card.png`)
            : getApiUrl(`/media-assets/${photo.mediaAssetId}/content`);
          const time = formatVideoTime(photo.videoTimestampMs);
          return (
            <section className="html-report-page" key={photo.taskPhotoId}>
              <header><span>问题 {String(index + 1).padStart(2, "0")}</span><strong>{photo.issueTitle || photo.issueCategory || "巡检现场照片"}</strong></header>
              <img src={visualUrl} alt={photo.issueTitle || photo.fileName} />
              <div className="html-report-photo-info">
                <dl>
                  <div><dt>照片文件</dt><dd>{photo.fileName}</dd></div>
                  {time ? <div><dt>视频时间点</dt><dd>{time}</dd></div> : null}
                  {photo.latitude !== null && photo.latitude !== undefined && photo.longitude !== null && photo.longitude !== undefined
                    ? <div><dt>经纬度</dt><dd>{photo.latitude.toFixed(6)}, {photo.longitude.toFixed(6)}</dd></div>
                    : null}
                </dl>
                <p>{photo.issueDescription || "该照片已纳入本次巡检综合报告。"}</p>
              </div>
              <footer>巡检宝 · {report.relatedObjectName} · 第 {index + 1} 页</footer>
            </section>
          );
        })}
      </main>
    </>
  );
}
