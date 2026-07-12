import { Button, Form, Input, Modal, Space } from "antd";
import { getPublicApiUrl } from "../api/client";
import type { IssuePushDraft, IssuePushResult } from "../pages/issue-event-push-state";

export function IssueEventPushModal(props: { open: boolean; initial: IssuePushDraft; loading: boolean; result: IssuePushResult | null; onCancel(): void; onSubmit(value: IssuePushDraft): void }) {
  const [form] = Form.useForm<IssuePushDraft>();
  return <Modal open={props.open} title="事件推送" footer={null} onCancel={props.onCancel} destroyOnClose afterOpenChange={(open) => open && form.setFieldsValue(props.initial)}>
    {props.result ? <div className="issue-push-result">
      <img alt="问题分享卡" src={getPublicApiUrl(props.result.cardImageUrl.replace("/api/v1", ""))} />
      <Space wrap><Button type="primary" href={getPublicApiUrl(props.result.cardImageUrl.replace("/api/v1", "").replace("/card.png", "/card-download.png"))}>下载 PNG</Button><Button onClick={() => void navigator.clipboard.writeText(props.result!.shareUrl)}>复制分享链接</Button><Button href={props.result.issueDetailUrl}>打开问题详情</Button></Space>
    </div> : <Form form={form} layout="vertical" onFinish={props.onSubmit}>
      <Form.Item name="locationName" label="点位／区域" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="foundAt" label="发现时间" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
      <Form.Item name="category" label="问题类型" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="description" label="问题描述" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
      <Button block htmlType="submit" loading={props.loading} type="primary">创建问题并生成分享卡</Button>
    </Form>}
  </Modal>;
}
