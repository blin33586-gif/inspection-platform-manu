import { useState } from "react";
import { Button, Form, Input, message, Modal, Select } from "antd";
import type { ManagedObjectSummary, PageResult } from "@xunjianbao/shared";
import { postJsonApi } from "../api/client";
import { roads } from "../data";
import { ObjectCard } from "../components/ObjectCard";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackRoads: PageResult<ManagedObjectSummary> = {
  items: roads,
  page: 1,
  pageSize: 20,
  total: roads.length,
};

export function RoadsPage() {
  const [form] = Form.useForm<{ name?: string; status?: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data, reload } = useApiResource("/roads", fallbackRoads);

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
      <PageHeader eyebrow="ROAD MANAGEMENT" title="道路街面" actions={<Button type="primary" onClick={() => setOpen(true)}>新增道路</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">ROAD ARCHIVES</p>
            <h3>重点道路档案</h3>
          </div>
        </div>
        <div className="card-grid">{data.items.map((item) => <ObjectCard key={item.id} item={item} to={`/roads/${item.id}`} />)}</div>
      </section>

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
            <Input placeholder="例如：曲阳路" />
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
