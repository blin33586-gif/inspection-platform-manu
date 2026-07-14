import { useMemo, useRef, useState } from "react";
import { Button, message } from "antd";
import { ArrowLeft, Printer } from "lucide-react";
import { useParams } from "react-router-dom";
import { buildReportPhotoPageModel, REPORT_DOCUMENT_COPY, type ReportSummary } from "@xunjianbao/shared";
import { downloadApiFile, getApiUrl } from "../api/client";
import { reports } from "../data";
import { ApiResourceError } from "../components/ApiResourceError";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { canExportReport, createSingleFlightRunner, getReportDownloadName } from "./report-export";

function fallbackReport(id: string | undefined): ReportSummary {
  return reports.find((item) => item.id === id) ?? { ...reports[0], photos: [] };
}

export function ReportDetailPage() {
  const { id } = useParams();
  const fallback = useMemo(() => fallbackReport(id), [id]);
  const { data: report, error, hasLoaded, reload } = useApiResource<ReportSummary>(`/reports/${id}`, fallback);
  const [exporting, setExporting] = useState(false);
  const exportRunner = useRef(createSingleFlightRunner());

  async function exportPdf() {
    if (!id) return;
    try {
      await exportRunner.current.run(async () => {
        setExporting(true);
        try {
          await downloadApiFile(`/reports/${id}/pdf`, getReportDownloadName(report.title));
        } finally {
          setExporting(false);
        }
      });
    } catch (downloadError) {
      message.error(downloadError instanceof Error ? downloadError.message : "PDF 导出失败");
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
            <Button disabled={!canExportReport(hasLoaded, exporting)} loading={exporting} type="primary" onClick={() => void exportPdf()}>导出 PDF</Button>
            <Button icon={<Printer size={16} />} onClick={() => window.print()}>打印</Button>
          </>
        )}
      />
      <main className="html-report-document">
        <section className="html-report-cover">
          <span>{REPORT_DOCUMENT_COPY.kicker}</span>
          <h1>{report.title}</h1>
          <dl>
            <div><dt>{REPORT_DOCUMENT_COPY.reportDate}</dt><dd>{report.reportDate}</dd></div>
            <div><dt>{REPORT_DOCUMENT_COPY.relatedObject}</dt><dd>{report.relatedObjectName}</dd></div>
            <div><dt>{REPORT_DOCUMENT_COPY.issueCount}</dt><dd>{report.issueCount}</dd></div>
            <div><dt>{REPORT_DOCUMENT_COPY.photoCount}</dt><dd>{report.photos?.length ?? 0}</dd></div>
          </dl>
          {report.contentSummary ? <p>{report.contentSummary}</p> : null}
        </section>

        {report.photos?.map((photo, index) => {
          const visualUrl = photo.issueCardId
            ? getApiUrl(`/issues/${photo.issueCardId}/card.png`)
            : getApiUrl(`/media-assets/${photo.mediaAssetId}/content`);
          const page = buildReportPhotoPageModel({
            index,
            relatedObjectName: report.relatedObjectName,
            fileName: photo.fileName,
            issueTitle: photo.issueTitle,
            issueCategory: photo.issueCategory,
            issueDescription: photo.issueDescription,
            videoTimestampMs: photo.videoTimestampMs,
            latitude: photo.latitude,
            longitude: photo.longitude,
          });
          return (
            <section className="html-report-page" key={photo.taskPhotoId}>
              <header><span>{page.indexLabel}</span><strong>{page.title}</strong></header>
              <img src={visualUrl} alt={page.title || page.fileName} />
              <div className="html-report-photo-info">
                <dl>
                  <div><dt>{REPORT_DOCUMENT_COPY.photoFile}</dt><dd>{page.fileName}</dd></div>
                  {page.videoTime ? <div><dt>{REPORT_DOCUMENT_COPY.videoTime}</dt><dd>{page.videoTime}</dd></div> : null}
                  {page.coordinates ? <div><dt>{REPORT_DOCUMENT_COPY.coordinates}</dt><dd>{page.coordinates}</dd></div> : null}
                </dl>
                <p>{page.description}</p>
              </div>
              <footer>{page.footer}</footer>
            </section>
          );
        })}
      </main>
    </>
  );
}
