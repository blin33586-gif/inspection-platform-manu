import assert from "node:assert/strict";
import test from "node:test";
import { validateMemberDraft } from "./platform-member-state.js";

test("member payload requires an account, phone, password, and project", () => {
  assert.deepEqual(
    validateMemberDraft({ name: "", phone: "", username: "", password: "", projectIds: [] }),
    ["请输入姓名", "请输入正确手机号", "请输入登录账号", "密码至少 8 位", "至少选择一个项目"],
  );
});
