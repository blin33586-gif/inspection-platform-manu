import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Input, message, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import type { MapAssetSummary, PageResult } from "@xunjianbao/shared";
import { postFormApi, withQuery } from "../api/client";
import { getApiErrorCopy } from "../api/api-error-copy";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import {
  formatMapFileSize,
  isSupportedMapFile,
  mapMapHistoryResponse,
  shouldPollMapHistory,
  type MapHistoryRow,
} from "./map-upload-presenter";

interface MapUploadForm {
  name: string;
  file: UploadFile[];
}

const emptyMapHistory: PageResult<MapAssetSummary> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

const mapStatusColors: Record<string, string> = {
  queued: "gold",
  running: "blue",
  processing: "blue",
  published: "green",
  failed: "red",
};

export function MapAssetsPage() {
  const [form] = Form.useForm<MapUploadForm>();
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const uploadSequence = useRef(0);
  const mounted = useRef(true);
  const historyResource = useApiResource<PageResult<MapAssetSummary>>(
    withQuery("/map-assets", { page, pageSize }),
    emptyMapHistory,
  );
  const history = useMemo(
    () => mapMapHistoryResponse(historyResource.data),
    [historyResource.data],
  );
  const polling = shouldPollMapHistory(historyResource.data.items);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadSequence.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!polling) return undefined;
    const timer = window.setTimeout(historyResource.reload, 3_000);
    return () => window.clearTimeout(timer);
  }, [historyResource.data, historyResource.reload, polling]);

  const submitUpload = async (values: MapUploadForm) => {
    const uploadFile = values.file?.[0]?.originFileObj;
    if (!uploadFile) {
      message.error("请选择地图文件");
      return;
    }
    if (!isSupportedMapFile(uploadFile.name)) {
      message.error("仅支持 .tif、.tiff 或 .zip 地图文件");
      return;
    }

    const requestId = ++uploadSequence.current;
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("name", values.name.trim());

    setSubmitting(true);
    try {
      await postFormApi<MapAssetSummary>("/map-assets/upload", formData);
      if (!mounted.current || requestId !== uploadSequence.current) return;
      message.success("地图已上传，后台处理完成后将自动设为当前地图");
      form.resetFields();
      setPage(1);
      historyResource.reload();
    } catch (error) {
      if (!mounted.current || requestId !== uploadSequence.current) return;
      message.error(error instanceof Error ? error.message : "地图上传失败");
    } finally {
      if (mounted.current && requestId === uploadSequence.current) setSubmitting(false);
    }
  };

  const columns: ColumnsType<MapHistoryRow> = [
    { title: "地图名称", dataIndex: "name", width: 160 },
    { title: "文件名", dataIndex: "fileName", width: 220 },
    { title: "格式", dataIndex: "format", width: 86 },
    {
      title: "大小",
      dataIndex: "fileSize",
      width: 110,
      render: (value: number | null) => formatMapFileSize(value),
    },
    { title: "上传人", dataIndex: "uploadedByName", width: 120 },
    {
      title: "上传时间",
      dataIndex: "uploadedAt",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false }),
    },
    {
      title: "处理状态",
      dataIndex: "statusLabel",
      width: 220,
      render: (value: string, record) => (
        <div className="map-history-status">
          <Tag color={record.processStatus === "published" && !record.isActive ? "default" : mapStatusColors[record.processStatus] ?? "default"}>{value}</Tag>
          {record.processStatus === "failed"
            ? <span className="map-history-error">{record.errorMessage || "未返回失败原因"}</span>
            : null}
        </div>
      ),
    },
    {
      title: "当前地图",
      dataIndex: "isActive",
      width: 110,
      render: (value: boolean) => value ? <Tag color="success">是</Tag> : <span className="map-history-muted">否</span>,
    },
  ];

  return (
    <>
      <PageHeader eyebrow="PROJECT MAP" title="地图管理" />

      <section className="content-section map-upload-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">UPLOAD MAP</p>
            <h3>上传项目地图</h3>
            <p className="map-section-description">支持 TIF、TIFF 底图和 ZIP 瓦片包，处理成功后由后台自动切换为当前地图。</p>
          </div>
        </div>
        <Form<MapUploadForm>
          className="map-upload-form"
          form={form}
          layout="vertical"
          onFinish={submitUpload}
        >
          <Form.Item name="name" label="地图名称" rules={[{ required: true, whitespace: true, message: "请输入地图名称" }]}>
            <Input placeholder="例如：园区 2026 年 7 月底图" />
          </Form.Item>
          <Form.Item
            name="file"
            label="地图文件"
            valuePropName="fileList"
            getValueFromEvent={(event: { fileList?: UploadFile[] }) => event.fileList ?? []}
            rules={[{ required: true, message: "请选择地图文件" }]}
            extra="可上传 .tif、.tiff 或 .zip 文件"
          >
            <Upload
              accept=".tif,.tiff,.zip"
              beforeUpload={(file) => {
                if (isSupportedMapFile(file.name)) return false;
                message.error("仅支持 .tif、.tiff 或 .zip 地图文件");
                return Upload.LIST_IGNORE;
              }}
              maxCount={1}
            >
              <Button>选择文件</Button>
            </Upload>
          </Form.Item>
          <Button htmlType="submit" type="primary" loading={submitting}>上传地图</Button>
        </Form>
      </section>

      <section className="content-section map-history-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">UPLOAD HISTORY</p>
            <h3>上传历史</h3>
          </div>
          {polling ? <span className="map-history-polling">地图处理中，列表将自动刷新</span> : null}
        </div>

        {historyResource.error ? (
          <Alert
            className="map-history-alert"
            type="error"
            showIcon
            message="上传历史暂时无法加载"
            description={getApiErrorCopy(historyResource.error as Error & { status?: number })}
            action={<Button size="small" onClick={historyResource.reload}>重新加载</Button>}
          />
        ) : (
          <Table<MapHistoryRow>
            className="data-table map-history-table"
            rowKey="id"
            columns={columns}
            dataSource={history.items}
            loading={historyResource.loading}
            scroll={{ x: 1_320 }}
            pagination={{
              current: history.page,
              pageSize: history.pageSize,
              total: history.total,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              },
            }}
          />
        )}
      </section>
    </>
  );
}
