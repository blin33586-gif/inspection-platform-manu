import { useState } from "react";
import { Button, Form, Input, message, Modal, Select } from "antd";
import type { ManagedObjectSummary, PageResult } from "@xunjianbao/shared";
import { postJsonApi } from "../api/client";
import { communities } from "../data";
import { ObjectCard } from "../components/ObjectCard";
import { PageHeader } from "../components/PageHeader";
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
  const { data, reload } = useApiResource("/communities", fallbackCommunities);
  const visibleItems = statusFilter === "全部" ? data.items : data.items.filter((item) => item.status === statusFilter);

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
      <PageHeader eyebrow="COMMUNITY ARCHIVES" title="小区档案" actions={<Button type="primary" onClick={() => setOpen(true)}>新增小区</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">COMMUNITY LIST</p>
            <h3>曲阳路街道小区</h3>
          </div>
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
        </div>
        {visibleItems.length ? (
          <div className="card-grid">{visibleItems.map((item) => <ObjectCard key={item.id} item={item} to={`/communities/${item.id}`} />)}</div>
        ) : <p className="empty-note">当前筛选下暂无小区。</p>}
      </section>

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
