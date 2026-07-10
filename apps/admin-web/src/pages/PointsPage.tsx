import { useState } from "react";
import { Button, Form, Input, message, Modal, Select } from "antd";
import type { PageResult, PointSummary } from "@xunjianbao/shared";
import { postJsonApi } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { communities, mediaLibraryItems, points, roads } from "../data";
import { PageHeader } from "../components/PageHeader";
import { ProjectArchiveWorkspace } from "../components/ProjectArchiveWorkspace";
import { useApiResource } from "../hooks/useApiResource";

const fallbackPoints: PageResult<PointSummary> = {
  items: points,
  page: 1,
  pageSize: 20,
  total: points.length,
};

export function PointsPage() {
  const [form] = Form.useForm<{ name?: string; pointType?: string; relatedObjectName?: string; status?: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data, error, reload } = useApiResource("/points", fallbackPoints);
  if (error) return <ApiResourceError error={error} onRetry={reload} />;
  const archiveItems = data.items.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    issueCount: item.issueCount,
    reportCount: item.reportCount,
    typeLabel: item.pointType,
    relatedName: item.relatedObjectName,
    path: `/points/${item.id}`,
  }));
  const projectGroups = [
    {
      key: "community" as const,
      label: "小区档案",
      path: "/communities",
      items: communities.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        issueCount: item.issueCount,
        reportCount: item.reportCount,
        typeLabel: "居住小区",
        path: `/communities/${item.id}`,
      })),
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
      items: archiveItems,
    },
  ];

  const submitPoint = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await postJsonApi<PointSummary>("/points", values);
      message.success("点位已新增");
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
      <PageHeader title="重点点位" actions={<Button type="primary" onClick={() => setOpen(true)}>新增点位</Button>} />
      <ProjectArchiveWorkspace activeItem={archiveItems[0]} items={archiveItems} mediaItems={mediaLibraryItems} projectGroups={projectGroups} variant="point" />

      <Modal
        title="新增重点点位"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitPoint}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ status: "待完善" }}>
          <Form.Item name="name" label="点位名称" rules={[{ required: true, message: "请输入点位名称" }]}>
            <Input placeholder="例如：曲阳路重点广告牌" />
          </Form.Item>
          <Form.Item name="pointType" label="点位类型">
            <Select
              options={[
                { label: "广告牌", value: "广告牌" },
                { label: "绿化河道", value: "绿化河道" },
                { label: "重点设施", value: "重点设施" },
                { label: "其他点位", value: "其他点位" },
              ]}
            />
          </Form.Item>
          <Form.Item name="relatedObjectName" label="关联对象">
            <Input placeholder="例如：曲阳路、曲阳路街道" />
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
