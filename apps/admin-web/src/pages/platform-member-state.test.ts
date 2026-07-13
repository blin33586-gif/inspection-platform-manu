import assert from "node:assert/strict";
import test from "node:test";
import {
  closePasswordDialog,
  isCurrentMutationContext,
  isProjectSelectionAvailable,
  openPasswordDialog,
  validateMemberDraft,
  type MemberMutationContext,
} from "./platform-member-state.js";

test("member payload requires an account, phone, password, and project", () => {
  assert.deepEqual(
    validateMemberDraft({ name: "", phone: "", username: "", password: "", projectIds: [] }),
    ["请输入姓名", "请输入正确手机号", "请输入登录账号", "密码至少 8 位", "至少选择一个项目"],
  );
});

test("password dialog clears the form before opening and when closing", () => {
  const events: string[] = [];
  const form = { resetFields: () => events.push("reset") };
  const selectMember = (member: { id: string } | null) => events.push(member ? `member:${member.id}` : "closed");

  openPasswordDialog(form, selectMember, { id: "member-b" });
  closePasswordDialog(form, selectMember);

  assert.deepEqual(events, ["reset", "member:member-b", "reset", "closed"]);
});

test("project selection is unavailable until projects load successfully", () => {
  assert.equal(isProjectSelectionAvailable({ loading: true, hasLoaded: false, error: null }), false);
  assert.equal(isProjectSelectionAvailable({ loading: false, hasLoaded: false, error: new Error("network") }), false);
  assert.equal(isProjectSelectionAvailable({ loading: false, hasLoaded: true, error: null }), true);
});

test("mutation completion only applies to the same target and dialog instance", () => {
  const submitted: MemberMutationContext = { kind: "edit", memberId: "member-a", instance: 3 };

  assert.equal(isCurrentMutationContext(submitted, { ...submitted }), true);
  assert.equal(isCurrentMutationContext(submitted, { ...submitted, memberId: "member-b" }), false);
  assert.equal(isCurrentMutationContext(submitted, { ...submitted, instance: 4 }), false);
  assert.equal(isCurrentMutationContext(submitted, null), false);
});
