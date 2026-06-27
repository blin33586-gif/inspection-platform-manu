import { useState } from "react";
import { Button, Form, Input, message, Modal, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import type { MapAssetSummary, PageResult } from "@xunjianbao/shared";
import { postFormApi } from "../api/client";
import { mapAssets } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackMapAssets: PageResult<MapAssetSummary> = {
  items: mapAssets,
  page: 1,
  pageSize: 20,
  total: mapAssets.length,
};

const columns: ColumnsType<MapAssetSummary> = [
  { title: "地图名称", dataIndex: "name" },
  { title: "地图类型", dataIndex: "mapType" },
  {
    title: "来源",
    dataIndex: "sourceType",
    render: (value) => <Tag color={value === "tiff" ? "purple" : "blue"}>{value === "tiff" ? "TIF" : "图片"}</Tag>,
  },
  {
    title: "处理状态",
    dataIndex: "processStatus",
    render: (value) => <Tag color={value === "processed" ? "green" : "orange"}>{value === "processed" ? "已处理" : "已上传"}</Tag>,
  },
  { title: "热区", dataIndex: "hotAreaCount" },
];

export function MapAssetsPage() {
  const [form] = Form.useForm<{ name?: string; mapType?: string; file?: UploadFile[] }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data, loading, reload } = useApiResource("/map-assets", fallbackMapAssets);

  const submitUpload = async () => {
    const values = await form.validateFields();
    const uploadFile = values.file?.[0]?.originFileObj;
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (values.name) formData.append("name", values.name);
    if (values.mapType) formData.append("mapType", values.mapType);

    setSubmitting(true);
    try {
      await postFormApi<MapAssetSummary>("/map-assets/upload", formData);
      message.success("地图已上传");
      form.resetFields();
      setOpen(false);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="MAP ASSETS" title="地图资产" actions={<Button type="primary" onClick={() => setOpen(true)}>上传地图</Button>} />
      <section className="content-section map-assets">
        <div className="section-head">
          <div>
            <p className="eyebrow">TIF WORKFLOW</p>
            <h3>TIF 地图处理流程</h3>
          </div>
        </div>
        <div className="pipeline">
          <div><strong>1</strong><span>上传 TIF / 照片地图</span></div>
          <div><strong>2</strong><span>生成 WebP 预览或瓦片</span></div>
          <div><strong>3</strong><span>绘制小区和道路热区</span></div>
          <div><strong>4</strong><span>绑定档案并在首页点击进入</span></div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">MAP LIST</p>
            <h3>地图文件列表</h3>
          </div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} pagination={false} className="data-table" />
      </section>

      <Modal
        title="上传地图"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submitUpload}
        confirmLoading={submitting}
        okText="上传"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="地图名称">
            <Input placeholder="例如：玉田新村小区地图" />
          </Form.Item>
          <Form.Item name="mapType" label="地图类型">
            <Input placeholder="例如：小区地图、街道总览" />
          </Form.Item>
          <Form.Item
            name="file"
            label="地图文件"
            valuePropName="fileList"
            getValueFromEvent={(event: { fileList?: UploadFile[] }) => event.fileList ?? []}
            rules={[{ required: true, message: "请选择地图文件" }]}
          >
            <Upload accept=".png,.jpg,.jpeg,.webp,.tif,.tiff" beforeUpload={() => false} maxCount={1}>
              <Button>选择文件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
