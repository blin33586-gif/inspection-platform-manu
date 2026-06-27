import { useState } from "react";
import { Button, Form, Input, message, Modal, Select, Tag } from "antd";
import { Link } from "react-router-dom";
import type { PageResult, PointSummary } from "@xunjianbao/shared";
import { postJsonApi } from "../api/client";
import { points } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackPoints: PageResult<PointSummary> = {
  items: points,
  page: 1,
  pageSize: 20,
  total: points.length,
};

function statusColor(status: string) {
  if (status === "待复查") return "orange";
  if (status === "重点") return "red";
  if (status === "稳定") return "green";
  return "blue";
}

export function PointsPage() {
  const [form] = Form.useForm<{ name?: string; pointType?: string; relatedObjectName?: string; status?: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data, reload } = useApiResource("/points", fallbackPoints);

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
      <PageHeader eyebrow="KEY POINTS" title="重点点位" actions={<Button type="primary" onClick={() => setOpen(true)}>新增点位</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">POINT ARCHIVES</p>
            <h3>广告牌、河道、重点设施</h3>
          </div>
        </div>
        <div className="card-grid">
          {data.items.map((item) => (
            <Link className="archive-card-link" to={`/points/${item.id}`} key={item.id}>
              <article className="archive-card point-card">
                <Tag color={statusColor(item.status)}>{item.status}</Tag>
                <h4>{item.name}</h4>
                <p>{item.pointType} / 关联 {item.relatedObjectName}，用于沉淀广告牌、河道绿化、重点设施等点位巡检资料。</p>
                <div className="mini-stats">
                  <span>问题 {item.issueCount}</span>
                  <span>报告 {item.reportCount}</span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </section>

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
