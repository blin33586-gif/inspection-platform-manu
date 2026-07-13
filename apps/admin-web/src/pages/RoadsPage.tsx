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

const fallbackRoads: PageResult<ManagedObjectSummary> = {
  items: roads,
  page: 1,
  pageSize: 20,
  total: roads.length,
};
const fallbackCommunities: PageResult<ManagedObjectSummary> = { items: communities, page: 1, pageSize: 20, total: communities.length };
const fallbackPoints: PageResult<PointSummary> = { items: points, page: 1, pageSize: 20, total: points.length };
const emptyManagedObjects: PageResult<ManagedObjectSummary> = { items: [], page: 1, pageSize: 20, total: 0 };
const emptyPoints: PageResult<PointSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

export function RoadsPage() {
  const { id: routeId } = useParams();
  const project = getCurrentProject();
  const isJinshan = project?.id === "jinshan";
  const canModify = canModifyProject(getUser()?.role);
  const [form] = Form.useForm<{ name?: string; status?: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data, error, reload } = useApiResource<PageResult<ManagedObjectSummary>>("/roads", isJinshan ? emptyManagedObjects : fallbackRoads);
  const communitiesResource = useApiResource<PageResult<ManagedObjectSummary>>("/communities", isJinshan ? emptyManagedObjects : fallbackCommunities);
  const pointsResource = useApiResource<PageResult<PointSummary>>("/points", isJinshan ? emptyPoints : fallbackPoints);
  if (error) return <ApiResourceError error={error} onRetry={reload} />;
  const archiveItems = data.items.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    issueCount: item.issueCount,
    reportCount: item.reportCount,
    typeLabel: "道路街面",
    path: `/roads/${item.id}`,
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
      items: archiveItems,
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

  const submitRoad = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await postJsonApi<ManagedObjectSummary>("/roads", values);
      message.success("道路已新增");
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
      <PageHeader title={isJinshan ? "道路档案" : "道路街面"} actions={canModify ? <Button type="primary" onClick={() => setOpen(true)}>新增道路</Button> : undefined} />
      <ProjectArchiveWorkspace activeItem={activeItem} items={archiveItems} projectGroups={projectGroups} variant="road" />

      <Modal
        title="新增道路"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitRoad}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ status: "待完善" }}>
          <Form.Item name="name" label="道路名称" rules={[{ required: true, message: "请输入道路名称" }]}>
            <Input placeholder={isJinshan ? "例如：园区一号路" : "例如：曲阳路"} />
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
