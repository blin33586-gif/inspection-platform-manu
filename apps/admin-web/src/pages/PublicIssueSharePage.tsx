import { Button, Result, Spin } from "antd";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApi, getApiUrl } from "../api/client";
import { buildTencentMapUrl, buildTencentNavigationUrl } from "./public-issue-share-state";

interface PublicIssue { locationName: string; foundAt: string; category: string; description: string; longitude: number | null; latitude: number | null; evidenceImageUrl: string }
export function PublicIssueSharePage() { const { shareToken = "" } = useParams(); const [item, setItem] = useState<PublicIssue | null>(null); const [failed, setFailed] = useState(false); useEffect(() => { getApi<PublicIssue>(`/public/issues/${shareToken}`).then(setItem).catch(() => setFailed(true)); }, [shareToken]); if (failed) return <Result status="warning" title="分享已失效" />; if (!item) return <Spin fullscreen />; const map = buildTencentMapUrl(item.latitude, item.longitude, item.locationName); const navigation = buildTencentNavigationUrl(item.latitude, item.longitude, item.locationName); return <main className="public-issue-page"><article><img alt="巡检问题现场" src={getApiUrl(item.evidenceImageUrl.replace("/api/v1", ""))} /><div className="public-issue-info"><span>{item.category}</span><h1>{item.locationName}</h1><time>{new Date(item.foundAt).toLocaleString("zh-CN")}</time><p>{item.description}</p><div><Button disabled={!map} href={map ?? undefined} target="_blank">地图定位</Button><Button disabled={!navigation} href={navigation ?? undefined} target="_blank" type="primary">开始导航</Button></div></div></article></main>; }
