import { useState } from "react";
import { Button, Empty, Modal, Spin } from "antd";
import { FilePenLine, Maximize2 } from "lucide-react";
import type { MediaGalleryItem } from "./media-asset-presenter";

interface MediaAssetGalleryProps {
  items: MediaGalleryItem[];
  loading: boolean;
  taskStatus: string;
  onWriteReport: (item: MediaGalleryItem) => void;
}

export function MediaAssetGallery({ items, loading, taskStatus, onWriteReport }: MediaAssetGalleryProps) {
  const [previewItem, setPreviewItem] = useState<MediaGalleryItem | null>(null);

  return (
    <section className="media-asset-gallery" aria-label="素材预览">
      <header>
        <div>
          <h3>素材预览</h3>
          <p>查看抽帧照片或图片包中的巡检照片</p>
        </div>
        <span>{items.length} 张</span>
      </header>

      {loading ? <div className="media-gallery-loading"><Spin /> 正在读取素材</div> : null}
      {!loading && !items.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={taskStatus === "已完成" ? "当前任务没有可预览图片" : "任务处理完成后将在这里显示图片"}
        />
      ) : null}

      {!loading && items.length ? <div className="media-asset-grid">
        {items.map((item) => (
          <article className="media-asset-card" key={item.id}>
            <button type="button" className="media-asset-image" onClick={() => setPreviewItem(item)}>
              <img src={item.contentUrl} alt={item.originalFileName} loading="lazy" />
              <span><Maximize2 size={15} />查看大图</span>
            </button>
            <footer>
              <strong title={item.originalFileName}>{item.caption}</strong>
              <Button size="small" icon={<FilePenLine size={14} />} onClick={() => onWriteReport(item)}>写报告</Button>
            </footer>
          </article>
        ))}
      </div> : null}

      <Modal
        centered
        footer={previewItem ? <Button type="primary" icon={<FilePenLine size={15} />} onClick={() => onWriteReport(previewItem)}>写报告</Button> : null}
        onCancel={() => setPreviewItem(null)}
        open={Boolean(previewItem)}
        title={previewItem?.originalFileName ?? "素材预览"}
        width={980}
      >
        {previewItem ? <img className="media-asset-modal-image" src={previewItem.contentUrl} alt={previewItem.originalFileName} /> : null}
      </Modal>
    </section>
  );
}
