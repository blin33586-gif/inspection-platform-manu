import { Button, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { IssueSummary, PageResult } from "@xunjianbao/shared";
import { issues } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackIssues: PageResult<IssueSummary> = {
  items: issues,
  page: 1,
  pageSize: 20,
  total: issues.length,
};

const columns: ColumnsType<IssueSummary> = [
  { title: "对象", dataIndex: "objectName" },
  { title: "问题", dataIndex: "title" },
  { title: "类型", dataIndex: "category" },
  {
    title: "状态",
    dataIndex: "status",
    render: (value) => {
      const label = value === "pending" ? "待处理" : value === "processing" ? "处理中" : value === "verified" ? "复查通过" : value;
      return <Tag color={value === "pending" ? "orange" : value === "verified" ? "green" : "blue"}>{label}</Tag>;
    },
  },
  { title: "发现时间", dataIndex: "foundAt" },
];

export function IssuesPage() {
  const { data, loading } = useApiResource("/issues", fallbackIssues);

  return (
    <>
      <PageHeader eyebrow="ISSUE LEDGER" title="问题台账" actions={<Button type="primary">新增问题</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">ALL ISSUES</p>
            <h3>重点问题列表</h3>
          </div>
          <div className="filter-bar"><button className="active">全部</button><button>待处理</button><button>处理中</button><button>复查通过</button></div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} pagination={false} className="data-table" />
      </section>
    </>
  );
}
