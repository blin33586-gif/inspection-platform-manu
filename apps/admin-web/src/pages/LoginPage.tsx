import { Button, Form, Input, message } from "antd";
import { useNavigate } from "react-router-dom";
import { postJsonApi } from "../api/client";
import { saveSession, type SessionUser } from "../auth/session";

interface LoginResponse {
  token: string;
  user: SessionUser;
}

export function LoginPage() {
  const navigate = useNavigate();

  const submit = async (values: { username: string; password: string }) => {
    try {
      const result = await postJsonApi<LoginResponse>("/auth/login", values);
      saveSession(result.token, result.user);
      message.success("登录成功");
      navigate("/", { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登录失败");
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <div className="brand-mark">巡</div>
          <div>
            <strong>巡检宝</strong>
            <span>无人机巡检平台</span>
          </div>
        </div>
        <div className="login-copy">
          <p className="eyebrow">QUYANG ROAD SUBDISTRICT</p>
          <h1>曲阳路街道巡检管理</h1>
        </div>
        <Form layout="vertical" onFinish={submit} initialValues={{ username: "admin" }}>
          <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </section>
    </main>
  );
}
