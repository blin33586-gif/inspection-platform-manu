import QRCode from "qrcode";
import sharp from "sharp";
import { escapeXml, wrapText } from "./issue-card-layout.js";

export interface RenderIssueCardInput {
  annotatedPhoto: Buffer;
  locationName: string;
  foundAt: string;
  category: string;
  description: string;
  shareUrl: string;
  annotationJson?: string;
}

interface SvgInput extends RenderIssueCardInput {
  qrDataUrl: string;
}

function textLines(lines: string[], x: number, y: number, lineHeight: number) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}">${escapeXml(line)}</text>`).join("");
}

export function buildIssueCardSvg(input: SvgInput) {
  const location = wrapText(input.locationName, 20, 2);
  const description = wrapText(input.description, 25, 3);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1400">
    <style>
      text { font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif; fill: #152536; font-size: 28px; }
      .label { fill: #718096; font-size: 20px; }
      .value { font-weight: 600; }
      .head { fill: #ffffff; font-size: 34px; font-weight: 600; }
      .small { fill: #506274; font-size: 18px; }
    </style>
    <rect y="1064" width="1200" height="336" fill="#ffffff"/>
    <rect width="1200" height="84" fill="#155493"/>
    <text class="head" x="42" y="55">巡检问题</text>
    <rect data-role="photo" x="0" y="84" width="1200" height="980" fill="transparent"/>
    <line x1="910" y1="1092" x2="910" y2="1370" stroke="#d5dee8" stroke-width="2"/>
    <text class="label" x="42" y="1118">点位／区域</text>
    <g class="value">${textLines(location, 42, 1155, 34)}</g>
    <text class="label" x="500" y="1118">发现时间</text>
    <text x="500" y="1155">${escapeXml(input.foundAt)}</text>
    <text class="label" x="42" y="1230">问题类型</text>
    <text class="value" x="42" y="1267">${escapeXml(input.category)}</text>
    <text class="label" x="42" y="1310">问题描述</text>
    <g>${textLines(description, 42, 1344, 31)}</g>
    <image data-role="qr" x="930" y="1110" width="220" height="220" href="${escapeXml(input.qrDataUrl)}"/>
    <text class="small" x="936" y="1364">扫码查看问题详情</text>
  </svg>`;
}

export async function renderIssueCard(input: RenderIssueCardInput) {
  const qrDataUrl = await QRCode.toDataURL(input.shareUrl, { errorCorrectionLevel: "M", margin: 1, width: 220 });
  const resizedPhoto = await sharp(input.annotatedPhoto).resize(1200, 980, { fit: "cover" }).png().toBuffer();
  const photo = await sharp(resizedPhoto).composite([{ input: Buffer.from(buildAnnotationOverlay(input.annotationJson)), top: 0, left: 0 }]).png().toBuffer();
  const svg = Buffer.from(buildIssueCardSvg({ ...input, qrDataUrl }));
  return sharp({ create: { width: 1200, height: 1400, channels: 4, background: "#ffffff" } })
    .composite([{ input: photo, top: 84, left: 0 }, { input: svg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

function buildAnnotationOverlay(value?: string) {
  let elements: Array<Record<string, unknown>> = [];
  try { elements = value ? (JSON.parse(value) as { elements?: Array<Record<string, unknown>> }).elements ?? [] : []; } catch { elements = []; }
  const marks = elements.map((item) => {
    const color = typeof item.color === "string" ? escapeXml(item.color) : "#ef4444";
    const x = Number(item.x ?? 0) * 1200; const y = Number(item.y ?? 0) * 980;
    if (item.type === "rectangle") return `<rect x="${x}" y="${y}" width="${Number(item.width ?? 0) * 1200}" height="${Number(item.height ?? 0) * 980}" fill="none" stroke="${color}" stroke-width="8"/>`;
    if (item.type === "arrow") return `<line x1="${x}" y1="${y}" x2="${Number(item.endX ?? 0) * 1200}" y2="${Number(item.endY ?? 0) * 980}" stroke="${color}" stroke-width="8" marker-end="url(#arrow)"/>`;
    if (item.type === "text") return `<text x="${x}" y="${y}" fill="${color}" font-size="34" font-family="PingFang SC, sans-serif" font-weight="600">${escapeXml(String(item.text ?? ""))}</text>`;
    return "";
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="980"><defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto"><path d="M0,0 L0,8 L11,4 z" fill="#ef4444"/></marker></defs>${marks}</svg>`;
}
