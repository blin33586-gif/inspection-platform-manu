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

const fallbackPoints: PageResult<PointSummary> = {
  items: points,
  page: 1,
  pageSize: 20,
  total: points.length,
};
const fallbackCommunities: PageResult<ManagedObjectSummary> = { items: communities, page: 1, pageSize: 20, total: communities.length };
const fallbackRoads: PageResult<ManagedObjectSummary> = { items: roads, page: 1, pageSize: 20, total: roads.length };
const emptyManagedObjects: PageResult<ManagedObjectSummary> = { items: [], page: 1, pageSize: 20, total: 0 };
const emptyPoints: PageResult<PointSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

export function PointsPage() {
  const { id: routeId } = useParams();
  const project = getCurrentProject();
  const isJinshan = project?.id === "jinshan";
  const canModify = canModifyProject(getUser()?.role);
  const [form] = Form.useForm<{ name?: string; pointType?: string; relatedObjectName?: string; status?: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data, error, reload } = useApiResource<PageResult<PointSummary>>("/points", isJinshan ? emptyPoints : fallbackPoints);
  const communitiesResource = useApiResource<PageResult<ManagedObjectSummary>>("/communities", isJinshan ? emptyManagedObjects : fallbackCommunities);
  const roadsResource = useApiResource<PageResult<ManagedObjectSummary>>("/roads", isJinshan ? emptyManagedObjects : fallbackRoads);
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
      label: isJinshan ? "企业档案" : "小区档案",
      path: "/communities",
      items: communitiesResource.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        issueCount: item.issueCount,
        reportCount: item.reportCount,
        typeLabel: isJinshan ? "入园企业" : "居住小区",
        path: `/communities/${item.id}`,
      })),
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
      items: archiveItems,
    },
  ];
  const activeItem = archiveItems.find((item) => item.id === routeId) ?? archiveItems[0];

  const submitPoint = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await postJsonApi<PointSummary>("/points", values);
      message.success(isJinshan ? "河道已新增" : "点位已新增");
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
      <PageHeader title={isJinshan ? "河道档案" : "重点点位"} actions={canModify ? <Button type="primary" onClick={() => setOpen(true)}>{isJinshan ? "新增河道" : "新增点位"}</Button> : undefined} />
      <ProjectArchiveWorkspace activeItem={activeItem} items={archiveItems} projectGroups={projectGroups} variant="point" />

      <Modal
        title={isJinshan ? "新增河道" : "新增重点点位"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitPoint}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ status: "待完善" }}>
          <Form.Item name="name" label={isJinshan ? "河道名称" : "点位名称"} rules={[{ required: true, message: isJinshan ? "请输入河道名称" : "请输入点位名称" }]}>
            <Input placeholder={isJinshan ? "例如：园区东河" : "例如：曲阳路重点广告牌"} />
          </Form.Item>
          <Form.Item name="pointType" label={isJinshan ? "河道类型" : "点位类型"}>
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
            <Input placeholder="例如：园区大门、重点河段" />
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
