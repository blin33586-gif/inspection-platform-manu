import { useState } from "react";
import { FileArchive, PlayCircle } from "lucide-react";
import { getMediaPreviewMode, type MediaTaskAssetKind } from "./media-task-preview";

interface MediaTaskPreviewProps {
  assetKind: MediaTaskAssetKind;
  alt: string;
  posterUrl: string;
  videoUrl?: string;
}

export function MediaTaskPreview({ assetKind, alt, posterUrl, videoUrl }: MediaTaskPreviewProps) {
  const [hovered, setHovered] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const mode = getMediaPreviewMode(assetKind, hovered) === "video" && videoUrl && !previewFailed
    ? "video"
    : "poster";

  return (
    <div
      className={`media-task-preview ${mode === "video" ? "is-playing" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {mode === "video" ? (
        <video
          aria-label={`${alt} 视频预览`}
          autoPlay
          loop
          muted
          onError={() => setPreviewFailed(true)}
          playsInline
          poster={posterUrl}
          preload="metadata"
          src={videoUrl}
        />
      ) : (
        <img src={posterUrl} alt={alt} />
      )}
      <span className="media-task-preview-icon" aria-hidden="true">
        {assetKind === "video" ? <PlayCircle size={22} /> : <FileArchive size={21} />}
      </span>
    </div>
  );
}
