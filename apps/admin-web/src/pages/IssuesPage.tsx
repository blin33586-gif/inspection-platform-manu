import { useState } from "react";
import { Button, Input, Select, Tag } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { IssueSummary, PageResult } from "@xunjianbao/shared";
import { getApiUrl, withQuery } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { issueLibraryStatus, type IssueLibraryStatus } from "./issue-library-presenter";

const emptyIssues: PageResult<IssueSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

export function IssuesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") as IssueLibraryStatus | null;
  const [keyword, setKeyword] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState<IssueLibraryStatus | undefined>(initialStatus ?? undefined);
  const [page, setPage] = useState(1);
  const resource = useApiResource(withQuery("/issues", {
    keyword,
    workflowStatus,
    cardOnly: "true",
    page,
    pageSize: 20,
  }), emptyIssues);

  if (resource.error) return <ApiResourceError error={resource.error} onRetry={resource.reload} />;

  return (
    <>
      <PageHeader title="问题库" />
      <section className="content-section issue-library-section">
        <div className="section-head issue-library-head">
          <div>
            <h3>问题卡片</h3>
            <span>按照片查看巡检发现的问题</span>
          </div>
          <div className="filter-controls issue-library-filters">
            <Input.Search
              allowClear
              placeholder="搜索照片问题、点位或类型"
              onSearch={(value) => { setKeyword(value); setPage(1); }}
              onChange={(event) => { if (!event.target.value) { setKeyword(""); setPage(1); } }}
            />
            <Select
              allowClear
              placeholder="全部状态"
              value={workflowStatus}
              onChange={(value) => { setWorkflowStatus(value); setPage(1); }}
              options={[
                { label: "待处理", value: "pending" },
                { label: "已处理", value: "processed" },
              ]}
            />
          </div>
        </div>

        {resource.loading ? <div className="issue-library-empty">正在读取问题卡片...</div> : null}
        {!resource.loading && resource.data.items.length === 0 ? (
          <div className="issue-library-empty">暂无符合条件的问题卡片</div>
        ) : (
          <div className="issue-card-library-grid">
            {resource.data.items.map((issue) => {
              const status = issueLibraryStatus(issue.status);
              return (
                <article className="issue-library-card" key={issue.id}>
                  <button className="issue-library-image" type="button" onClick={() => navigate(`/issues/${issue.id}`)}>
                    <img
                      src={getApiUrl(issue.cardImageUrl?.replace("/api/v1", "") ?? `/issues/${issue.id}/card.png`)}
                      alt={issue.title}
                    />
                    <Tag color={status === "pending" ? "orange" : "green"}>{status === "pending" ? "待处理" : "已处理"}</Tag>
                  </button>
                  <div className="issue-library-card-body">
                    <strong>{issue.title}</strong>
                    <span>{issue.locationName || issue.objectName} · {issue.category}</span>
                    <time dateTime={issue.foundAt}>{new Date(issue.foundAt).toLocaleString("zh-CN", { hour12: false })}</time>
                    <div>
                      <Button onClick={() => navigate(`/issues/${issue.id}`)}>详情</Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {resource.data.total > 20 ? (
          <div className="issue-library-pagination">
            <Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button>
            <span>第 {page} 页</span>
            <Button disabled={page * 20 >= resource.data.total} onClick={() => setPage((value) => value + 1)}>下一页</Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
