import { useState } from "react";
import { Button, Form, Input, message, Modal, Select } from "antd";
import type { ManagedObjectSummary, PageResult, PointSummary } from "@xunjianbao/shared";
import { postJsonApi } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { communities, points, roads } from "../data";
import { PageHeader } from "../components/PageHeader";
import { ProjectArchiveWorkspace } from "../components/ProjectArchiveWorkspace";
import { useApiResource } from "../hooks/useApiResource";
import { useParams } from "react-router-dom";
import { getCurrentProject, getUser } from "../auth/session";
import { canModifyProject } from "../auth/project-access";

const fallbackCommunities: PageResult<ManagedObjectSummary> = {
  items: communities,
  page: 1,
  pageSize: 20,
  total: communities.length,
};
const fallbackRoads: PageResult<ManagedObjectSummary> = { items: roads, page: 1, pageSize: 20, total: roads.length };
const fallbackPoints: PageResult<PointSummary> = { items: points, page: 1, pageSize: 20, total: points.length };
const emptyManagedObjects: PageResult<ManagedObjectSummary> = { items: [], page: 1, pageSize: 20, total: 0 };
const emptyPoints: PageResult<PointSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

const statusFilters = ["全部", "待复查", "重点", "稳定"];

export function CommunitiesPage() {
  const { id: routeId } = useParams();
  const project = getCurrentProject();
  const isJinshan = project?.id === "jinshan";
  const canModify = canModifyProject(getUser()?.role);
  const [form] = Form.useForm<{ name?: string; status?: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("全部");
  const { data, error, reload } = useApiResource<PageResult<ManagedObjectSummary>>("/communities", isJinshan ? emptyManagedObjects : fallbackCommunities);
  const roadsResource = useApiResource<PageResult<ManagedObjectSummary>>("/roads", isJinshan ? emptyManagedObjects : fallbackRoads);
  const pointsResource = useApiResource<PageResult<PointSummary>>("/points", isJinshan ? emptyPoints : fallbackPoints);
  if (error) return <ApiResourceError error={error} onRetry={reload} />;
  const visibleItems = statusFilter === "全部" ? data.items : data.items.filter((item) => item.status === statusFilter);
  const archiveItems = visibleItems.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    issueCount: item.issueCount,
    reportCount: item.reportCount,
    typeLabel: isJinshan ? "入园企业" : "居住小区",
    path: `/communities/${item.id}`,
  }));
  const projectGroups = [
    {
      key: "community" as const,
      label: isJinshan ? "企业档案" : "小区档案",
      path: "/communities",
      items: archiveItems,
    },
    {
      key: "road" as const,
      label: isJinshan ? "道路档案" : "街道档案",
      path: "/roads",
      items: roadsResource.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        issueCount: item.issueCount,
        reportCount: item.reportCount,
        typeLabel: "道路街面",
        path: `/roads/${item.id}`,
      })),
    },
    {
      key: "point" as const,
      label: isJinshan ? "河道档案" : "重点点位",
      path: "/points",
      items: pointsResource.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        issueCount: item.issueCount,
        reportCount: item.reportCount,
        typeLabel: isJinshan ? "园区河道" : item.pointType,
        relatedName: item.relatedObjectName,
        path: `/points/${item.id}`,
      })),
    },
  ];
  const activeItem = archiveItems.find((item) => item.id === routeId) ?? archiveItems[0];

  const submitCommunity = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await postJsonApi<ManagedObjectSummary>("/communities", values);
      message.success(isJinshan ? "企业已新增" : "小区已新增");
      form.resetFields();
      setOpen(false);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "新增失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title={isJinshan ? "企业档案" : "小区档案"} actions={canModify ? <Button type="primary" onClick={() => setOpen(true)}>{isJinshan ? "新增企业" : "新增小区"}</Button> : undefined} />
      <section className="project-filter-row">
        <div className="filter-bar">
          {statusFilters.map((item) => (
            <button
              className={statusFilter === item ? "active" : ""}
              key={item}
              type="button"
              aria-pressed={statusFilter === item}
              onClick={() => setStatusFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>
      <ProjectArchiveWorkspace activeItem={activeItem} items={archiveItems} projectGroups={projectGroups} variant="community" />

      <Modal
        title={isJinshan ? "新增企业" : "新增小区"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitCommunity}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ status: "待完善" }}>
          <Form.Item name="name" label={isJinshan ? "企业名称" : "小区名称"} rules={[{ required: true, message: isJinshan ? "请输入企业名称" : "请输入小区名称" }]}>
            <Input placeholder={isJinshan ? "例如：某化工企业" : "例如：玉田新村"} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: "待完善", value: "待完善" },
                { label: "待复查", value: "待复查" },
                { label: "重点", value: "重点" },
                { label: "稳定", value: "稳定" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
