import { useState } from "react";
import { Button, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { Link } from "react-router-dom";
import type { MapAssetSummary, MapHotAreaSummary, ObjectType, PageResult } from "@xunjianbao/shared";
import { getApiUrl, postFormApi, postJsonApi, withQuery } from "../api/client";
import { ApiResourceError } from "../components/ApiResourceError";
import { mapAssets } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackMapAssets: PageResult<MapAssetSummary> = {
  items: mapAssets,
  page: 1,
  pageSize: 20,
  total: mapAssets.length,
};

export function MapAssetsPage() {
  const [form] = Form.useForm<{ name?: string; mapType?: string; file?: UploadFile[] }>();
  const [tileForm] = Form.useForm<{ name?: string; mapType?: string; file?: UploadFile[] }>();
  const [hotAreaForm] = Form.useForm<{
    label?: string;
    objectType?: ObjectType;
    objectId?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>();
  const [open, setOpen] = useState(false);
  const [tileOpen, setTileOpen] = useState(false);
  const [hotAreaOpen, setHotAreaOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MapAssetSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tileSubmitting, setTileSubmitting] = useState(false);
  const [hotAreaSubmitting, setHotAreaSubmitting] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [mapType, setMapType] = useState<string | undefined>();
  const [processStatus, setProcessStatus] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, loading, error, reload } = useApiResource(withQuery("/map-assets", { keyword, mapType, processStatus, page, pageSize }), fallbackMapAssets);

  if (error) return <ApiResourceError error={error} onRetry={reload} />;

  const searchKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
  };

  const changeMapType = (value: string | undefined) => {
    setMapType(value);
    setPage(1);
  };

  const changeProcessStatus = (value: string | undefined) => {
    setProcessStatus(value);
    setPage(1);
  };

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

  const submitTileUpload = async () => {
    const values = await tileForm.validateFields();
    const uploadFile = values.file?.[0]?.originFileObj;
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (values.name) formData.append("name", values.name);
    if (values.mapType) formData.append("mapType", values.mapType);

    setTileSubmitting(true);
    try {
      await postFormApi<MapAssetSummary>("/map-assets/tile-packages/upload", formData);
      message.success("瓦片版本已上传，可在列表中发布到首页");
      tileForm.resetFields();
      setTileOpen(false);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "瓦片上传失败");
    } finally {
      setTileSubmitting(false);
    }
  };

  const publishTileMap = async (asset: MapAssetSummary) => {
    setSubmitting(true);
    try {
      await postJsonApi<MapAssetSummary>(`/map-assets/${asset.id}/publish`, {});
      message.success(`已将「${asset.name}」发布到首页`);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  const openHotAreaModal = (asset: MapAssetSummary) => {
    setSelectedAsset(asset);
    hotAreaForm.resetFields();
    setHotAreaOpen(true);
  };

  const submitHotArea = async () => {
    if (!selectedAsset) return;
    const values = await hotAreaForm.validateFields();

    setHotAreaSubmitting(true);
    try {
      await postJsonApi<MapHotAreaSummary>(`/map-assets/${selectedAsset.id}/hot-areas`, {
        label: values.label,
        objectType: values.objectType,
        objectId: values.objectId,
        x: values.x,
        y: values.y,
        width: values.width,
        height: values.height,
      });
      message.success("热区已新增");
      setHotAreaOpen(false);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "新增失败");
    } finally {
      setHotAreaSubmitting(false);
    }
  };

  const columns: ColumnsType<MapAssetSummary> = [
    { title: "地图名称", dataIndex: "name" },
    { title: "地图类型", dataIndex: "mapType" },
    {
      title: "来源",
      dataIndex: "sourceType",
      render: (value) => <Tag color={value === "tile" ? "cyan" : value === "tiff" ? "purple" : "blue"}>{value === "tile" ? "离线瓦片" : value === "tiff" ? "TIF" : "图片"}</Tag>,
    },
    {
      title: "处理状态",
      dataIndex: "processStatus",
      render: (value) => <Tag color={value === "published" || value === "processed" ? "green" : value === "ready" ? "blue" : "orange"}>{value === "published" ? "已发布" : value === "ready" ? "待发布" : value === "processed" ? "已处理" : "已上传"}</Tag>,
    },
    { title: "首页版本", render: (_, record) => record.isActive ? <Tag color="success">当前首页</Tag> : record.sourceType === "tile" ? "待发布" : "-" },
    { title: "热区", dataIndex: "hotAreaCount" },
    {
      title: "操作",
      render: (_, record) => (
        <Space>
          <Link className="table-action-link" to={`/map-assets/${record.id}`}>详情</Link>
          {record.sourceType === "tile" && !record.isActive ? <Button loading={submitting} size="small" type="primary" onClick={() => publishTileMap(record)}>发布首页</Button> : null}
          <Button size="small" onClick={() => openHotAreaModal(record)}>新增热区</Button>
          {record.fileName ? <Button size="small" href={getApiUrl(`/map-assets/${record.id}/file`)}>下载</Button> : null}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader eyebrow="MAP ASSETS" title="地图资产" actions={<Space><Button onClick={() => setOpen(true)}>上传普通地图</Button><Button type="primary" onClick={() => setTileOpen(true)}>更新首页瓦片</Button></Space>} />
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
          <div className="filter-controls map-filter-controls">
            <Input.Search
              placeholder="搜索地图名称、文件名"
              allowClear
              onSearch={searchKeyword}
              onChange={(event) => !event.target.value && searchKeyword("")}
            />
            <Select
              allowClear
              placeholder="地图类型"
              value={mapType}
              onChange={changeMapType}
              options={[
                { label: "小区地图", value: "小区" },
                { label: "街道总览", value: "街道" },
                { label: "道路地图", value: "道路" },
              ]}
            />
            <Select
              allowClear
              placeholder="处理状态"
              value={processStatus}
              onChange={changeProcessStatus}
              options={[
                { label: "已处理", value: "processed" },
                { label: "已上传", value: "uploaded" },
                { label: "待发布", value: "ready" },
                { label: "已发布", value: "published" },
              ]}
            />
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data.items}
          loading={loading}
          pagination={{
            current: data.page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          className="data-table"
        />
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

      <Modal
        title="更新首页离线瓦片"
        open={tileOpen}
        onCancel={() => setTileOpen(false)}
        onOk={submitTileUpload}
        confirmLoading={tileSubmitting}
        okText="上传版本"
        cancelText="取消"
      >
        <Form form={tileForm} layout="vertical">
          <Form.Item name="name" label="地图版本名称" rules={[{ required: true, message: "请输入版本名称" }]}>
            <Input placeholder="例如：曲阳街道 2026 年 7 月二维底图" />
          </Form.Item>
          <Form.Item name="mapType" label="地图类型" initialValue="街道总览">
            <Input placeholder="例如：街道总览" />
          </Form.Item>
          <Form.Item
            name="file"
            label="XYZ 瓦片 ZIP"
            valuePropName="fileList"
            getValueFromEvent={(event: { fileList?: UploadFile[] }) => event.fileList ?? []}
            rules={[{ required: true, message: "请选择瓦片 ZIP 文件" }]}
            extra="压缩包内应为 z/x/y.png，可包含一个最外层文件夹。上传后需在列表中发布，首页才会切换。"
          >
            <Upload accept=".zip,application/zip" beforeUpload={() => false} maxCount={1}>
              <Button>选择瓦片 ZIP</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`新增热区${selectedAsset ? `：${selectedAsset.name}` : ""}`}
        open={hotAreaOpen}
        onCancel={() => setHotAreaOpen(false)}
        onOk={submitHotArea}
        confirmLoading={hotAreaSubmitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={hotAreaForm} layout="vertical">
          <Form.Item name="label" label="热区名称" rules={[{ required: true, message: "请输入热区名称" }]}>
            <Input placeholder="例如：玉田新村、曲阳路、河道绿化带" />
          </Form.Item>
          <Form.Item name="objectType" label="对象类型" rules={[{ required: true, message: "请选择对象类型" }]}>
            <Select
              options={[
                { label: "小区", value: "community" },
                { label: "道路", value: "road" },
                { label: "重点点位", value: "point" },
                { label: "街道总览", value: "street" },
              ]}
              placeholder="请选择对象类型"
            />
          </Form.Item>
          <Form.Item name="objectId" label="对象 ID">
            <Input placeholder="例如：c-yutian、r-quyang" />
          </Form.Item>
          <div className="coordinate-grid">
            <Form.Item name="x" label="X%">
              <InputNumber min={0} max={100} precision={2} />
            </Form.Item>
            <Form.Item name="y" label="Y%">
              <InputNumber min={0} max={100} precision={2} />
            </Form.Item>
            <Form.Item name="width" label="宽%">
              <InputNumber min={0} max={100} precision={2} />
            </Form.Item>
            <Form.Item name="height" label="高%">
              <InputNumber min={0} max={100} precision={2} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
