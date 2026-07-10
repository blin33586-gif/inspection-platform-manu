export function getApiErrorCopy(error: Error & { status?: number }) {
  if (error.status === 401) return "登录状态已失效，请重新登录后再试";
  if (error.status === 404) return "该条资料不存在，可能已被删除或没有访问权限";
  return error.message || "数据加载失败，请检查服务连接后重试";
}
