import { Button } from "antd";
import { reports } from "../data";
import { PageHeader } from "../components/PageHeader";

export function ReportsPage() {
  return (
    <>
      <PageHeader eyebrow="REPORT CENTER" title="巡检报告" actions={<Button type="primary">上传报告</Button>} />
      <section className="content-section split-section">
        <article>
          <div className="section-head">
            <div>
              <p className="eyebrow">REPORT LIST</p>
              <h3>最新报告</h3>
            </div>
          </div>
          <div className="report-list">
            {reports.map((report) => (
              <button key={report.id}>
                <span>{report.reportDate.slice(5)}</span>
                <strong>{report.title}</strong>
                <em>{report.relatedObjectName} / {report.issueCount} 个问题</em>
              </button>
            ))}
          </div>
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
    </>
  );
}
