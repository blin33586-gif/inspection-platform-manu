import { Button, Result } from "antd";
import { getApiErrorCopy } from "../api/api-error-copy";

interface ApiResourceErrorProps {
  error: Error;
  onRetry: () => void;
}

export function ApiResourceError({ error, onRetry }: ApiResourceErrorProps) {
  return (
    <section className="content-section">
      <Result
        status="error"
        title="数据暂时无法加载"
        subTitle={getApiErrorCopy(error as Error & { status?: number })}
        extra={<Button type="primary" onClick={onRetry}>重新加载</Button>}
      />
    </section>
  );
}
