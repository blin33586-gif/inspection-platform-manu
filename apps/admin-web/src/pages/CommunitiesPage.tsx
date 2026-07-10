import { useState } from "react";
import { Button, Form, Input, message, Modal, Select } from "antd";
import type { ManagedObjectSummary, PageResult } from "@xunjianbao/shared";
import { postJsonApi } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { communities, mediaLibraryItems, points, roads } from "../data";
import { PageHeader } from "../components/PageHeader";
import { ProjectArchiveWorkspace } from "../components/ProjectArchiveWorkspace";
import { useApiResource } from "../hooks/useApiResource";

const fallbackCommunities: PageResult<ManagedObjectSummary> = {
  items: communities,
  page: 1,
  pageSize: 20,
  total: communities.length,
};

const statusFilters = ["全部", "待复查", "重点", "稳定"];

export function CommunitiesPage() {
  const [form] = Form.useForm<{ name?: string; status?: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("全部");
  const { data, error, reload } = useApiResource("/communities", fallbackCommunities);
  if (error) return <ApiResourceError error={error} onRetry={reload} />;
  const visibleItems = statusFilter === "全部" ? data.items : data.items.filter((item) => item.status === statusFilter);
  const archiveItems = visibleItems.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    issueCount: item.issueCount,
    reportCount: item.reportCount,
    typeLabel: "居住小区",
    path: `/communities/${item.id}`,
  }));
  const projectGroups = [
    {
      key: "community" as const,
      label: "小区档案",
      path: "/communities",
      items: archiveItems,
    },
    {
      key: "road" as const,
      label: "街道档案",
      path: "/roads",
      items: roads.map((item) => ({
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
      label: "重点点位",
      path: "/points",
      items: points.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        issueCount: item.issueCount,
        reportCount: item.reportCount,
        typeLabel: item.pointType,
        relatedName: item.relatedObjectName,
        path: `/points/${item.id}`,
      })),
    },
  ];

  const submitCommunity = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await postJsonApi<ManagedObjectSummary>("/communities", values);
      message.success("小区已新增");
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
      <PageHeader title="小区档案" actions={<Button type="primary" onClick={() => setOpen(true)}>新增小区</Button>} />
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
      <ProjectArchiveWorkspace activeItem={archiveItems[0]} items={archiveItems} mediaItems={mediaLibraryItems} projectGroups={projectGroups} variant="community" />

      <Modal
        title="新增小区"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitCommunity}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ status: "待完善" }}>
          <Form.Item name="name" label="小区名称" rules={[{ required: true, message: "请输入小区名称" }]}>
            <Input placeholder="例如：玉田新村" />
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
