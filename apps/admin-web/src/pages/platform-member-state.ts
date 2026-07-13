export interface MemberDraft {
  name: string;
  phone: string;
  username: string;
  password: string;
  projectIds: string[];
}

export function validateMemberDraft(draft: MemberDraft) {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("请输入姓名");
  if (!/^1[3-9]\d{9}$/.test(draft.phone.trim())) errors.push("请输入正确手机号");
  if (!draft.username.trim()) errors.push("请输入登录账号");
  if (draft.password.length < 8) errors.push("密码至少 8 位");
  if (draft.projectIds.length === 0) errors.push("至少选择一个项目");
  return errors;
}
