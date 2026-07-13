import { useRef, useState } from "react";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeft, KeyRound, Pencil, Plus, Power, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { patchJsonApi, postJsonApi } from "../api/client";
import type { SessionProject } from "../auth/project-access";
import { ApiResourceError } from "../components/ApiResourceError";
import { useApiResource } from "../hooks/useApiResource";
import {
  closePasswordDialog,
  isCurrentMutationContext,
  isProjectSelectionAvailable,
  openPasswordDialog,
  type MemberDraft,
  type MemberMutationContext,
  type MemberMutationKind,
  validateMemberDraft,
} from "./platform-member-state";

type MemberStatus = "active" | "disabled";

interface PlatformMember {
  id: string;
  name: string;
  phone: string;
  username: string;
  status: MemberStatus;
  projectIds: string[];
  projectNames: string[];
  createdAt: string;
}

interface MemberEditValues {
  name: string;
  phone: string;
  projectIds: string[];
}

interface PasswordResetValues {
  password: string;
}

const emptyMembers: PlatformMember[] = [];
const emptyProjects: SessionProject[] = [];

function requestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PlatformMembersPage() {
  const navigate = useNavigate();
  const members = useApiResource("/platform/members", emptyMembers);
  const projects = useApiResource("/auth/projects", emptyProjects);
  const [createForm] = Form.useForm<MemberDraft>();
  const [editForm] = Form.useForm<MemberEditValues>();
  const [passwordForm] = Form.useForm<PasswordResetValues>();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<PlatformMember | null>(null);
  const [passwordMember, setPasswordMember] = useState<PlatformMember | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogInstance = useRef(0);
  const activeDialog = useRef<MemberMutationContext | null>(null);
  const activeMutation = useRef<MemberMutationContext | null>(null);

  const projectOptions = projects.data.map((project) => ({ label: project.name, value: project.id }));
  const projectsAvailable = isProjectSelectionAvailable(projects);

  const nextDialogContext = (kind: MemberMutationKind, memberId: string | null) => {
    const context = { kind, memberId, instance: ++dialogInstance.current };
    activeDialog.current = context;
    return context;
  };

  const beginMutation = (context: MemberMutationContext) => {
    if (activeMutation.current || !isCurrentMutationContext(context, activeDialog.current)) return false;
    activeMutation.current = context;
    setSubmitting(true);
    return true;
  };

  const mutationStillCurrent = (context: MemberMutationContext) =>
    isCurrentMutationContext(context, activeMutation.current) &&
    isCurrentMutationContext(context, activeDialog.current);

  const finishMutation = (context: MemberMutationContext) => {
    if (!isCurrentMutationContext(context, activeMutation.current)) return;
    activeMutation.current = null;
    setSubmitting(false);
  };

  const createMember = async (values: MemberDraft) => {
    const context = activeDialog.current;
    if (!context || context.kind !== "create" || !projectsAvailable) {
      if (!projectsAvailable) message.error("项目列表不可用，请重新加载后再试");
      return;
    }
    const errors = validateMemberDraft(values);
    if (errors.length > 0) {
      message.error(errors[0]);
      return;
    }

    if (!beginMutation(context)) return;
    try {
      await postJsonApi<PlatformMember>("/platform/members", {
        name: values.name.trim(),
        phone: values.phone.trim(),
        username: values.username.trim(),
        password: values.password,
        projectIds: values.projectIds,
      });
      if (!mutationStillCurrent(context)) return;
      message.success("成员已新增");
      activeDialog.current = null;
      setCreateOpen(false);
      createForm.resetFields();
      members.reload();
    } catch (error) {
      if (mutationStillCurrent(context)) message.error(requestErrorMessage(error, "新增成员失败"));
    } finally {
      finishMutation(context);
    }
  };

  const openEdit = (member: PlatformMember) => {
    if (activeMutation.current || activeDialog.current || !projectsAvailable) return;
    editForm.resetFields();
    editForm.setFieldsValue({ name: member.name, phone: member.phone, projectIds: member.projectIds });
    nextDialogContext("edit", member.id);
    setEditingMember(member);
  };

  const closeEdit = () => {
    if (activeMutation.current) return;
    activeDialog.current = null;
    editForm.resetFields();
    setEditingMember(null);
  };

  const updateMember = async (values: MemberEditValues) => {
    const context = activeDialog.current;
    if (!editingMember || !context || context.kind !== "edit" || context.memberId !== editingMember.id) return;
    if (!projectsAvailable) {
      message.error("项目列表不可用，请重新加载后再试");
      return;
    }
    if (!beginMutation(context)) return;
    try {
      await patchJsonApi<PlatformMember>(`/platform/members/${encodeURIComponent(editingMember.id)}`, {
        name: values.name.trim(),
        phone: values.phone.trim(),
        projectIds: values.projectIds,
      });
      if (!mutationStillCurrent(context)) return;
      message.success("成员信息已更新");
      activeDialog.current = null;
      setEditingMember(null);
      editForm.resetFields();
      members.reload();
    } catch (error) {
      if (mutationStillCurrent(context)) message.error(requestErrorMessage(error, "更新成员失败"));
    } finally {
      finishMutation(context);
    }
  };

  const openPasswordReset = (member: PlatformMember) => {
    if (activeMutation.current || activeDialog.current) return;
    nextDialogContext("password", member.id);
    openPasswordDialog(passwordForm, setPasswordMember, member);
  };

  const closePasswordReset = () => {
    if (activeMutation.current) return;
    activeDialog.current = null;
    closePasswordDialog(passwordForm, setPasswordMember);
  };

  const resetPassword = async (values: PasswordResetValues) => {
    const context = activeDialog.current;
    if (!passwordMember || !context || context.kind !== "password" || context.memberId !== passwordMember.id) return;
    if (!beginMutation(context)) return;
    try {
      await postJsonApi<PlatformMember>(
        `/platform/members/${encodeURIComponent(passwordMember.id)}/reset-password`,
        { password: values.password },
      );
      if (!mutationStillCurrent(context)) return;
      message.success("密码已重置");
      activeDialog.current = null;
      closePasswordDialog(passwordForm, setPasswordMember);
    } catch (error) {
      if (mutationStillCurrent(context)) message.error(requestErrorMessage(error, "重置密码失败"));
    } finally {
      finishMutation(context);
    }
  };

  const confirmStatusChange = (member: PlatformMember) => {
    if (activeMutation.current || activeDialog.current) return;
    const enabling = member.status === "disabled";
    const context = nextDialogContext("status", member.id);
    const confirmation = Modal.confirm({
      title: enabling ? "启用成员" : "停用成员",
      content: enabling
        ? `确认启用“${member.name}”的账号？`
        : `确认停用“${member.name}”的账号？停用后其已登录会话将失效。`,
      okText: enabling ? "确认启用" : "确认停用",
      cancelText: "取消",
      okButtonProps: { danger: !enabling },
      closable: false,
      keyboard: false,
      maskClosable: false,
      async onOk() {
        if (!beginMutation(context)) return Promise.reject(new Error("当前操作已变更"));
        confirmation.update({ cancelButtonProps: { disabled: true } });
        try {
          await patchJsonApi<PlatformMember>(`/platform/members/${encodeURIComponent(member.id)}`, {
            status: enabling ? "active" : "disabled",
          });
          if (!mutationStillCurrent(context)) return Promise.reject(new Error("当前操作已变更"));
          message.success(enabling ? "成员已启用" : "成员已停用");
          activeDialog.current = null;
          members.reload();
        } catch (error) {
          if (mutationStillCurrent(context)) message.error(requestErrorMessage(error, "更新成员状态失败"));
          throw error;
        } finally {
          finishMutation(context);
          confirmation.update({ cancelButtonProps: { disabled: false } });
        }
      },
      onCancel() {
        if (!activeMutation.current && isCurrentMutationContext(context, activeDialog.current)) {
          activeDialog.current = null;
        }
      },
    });
  };

  const columns: ColumnsType<PlatformMember> = [
    { title: "姓名", dataIndex: "name", width: 120 },
    { title: "手机号", dataIndex: "phone", width: 140 },
    { title: "登录账号", dataIndex: "username", width: 140 },
    {
      title: "所属项目",
      dataIndex: "projectNames",
      render: (names: string[]) => <Space size={[4, 6]} wrap>{names.map((name) => <Tag color="blue" key={name}>{name}</Tag>)}</Space>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (status: MemberStatus) => (
        <Tag color={status === "active" ? "green" : "default"}>{status === "active" ? "已启用" : "已停用"}</Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "actions",
      width: 260,
      render: (_, member) => (
        <Space size={4}>
          <Button type="link" size="small" disabled={submitting || !projectsAvailable} icon={<Pencil size={14} />} onClick={() => openEdit(member)}>编辑</Button>
          <Button type="link" size="small" disabled={submitting} icon={<KeyRound size={14} />} onClick={() => openPasswordReset(member)}>重置密码</Button>
          <Button
            type="link"
            danger={member.status === "active"}
            disabled={submitting}
            size="small"
            icon={<Power size={14} />}
            onClick={() => confirmStatusChange(member)}
          >
            {member.status === "active" ? "停用" : "启用"}
          </Button>
        </Space>
      ),
    },
  ];

  const openCreate = () => {
    if (activeMutation.current || activeDialog.current || !projectsAvailable) return;
    createForm.resetFields();
    nextDialogContext("create", null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (activeMutation.current) return;
    activeDialog.current = null;
    createForm.resetFields();
    setCreateOpen(false);
  };

  return (
    <main className="platform-members-page">
      <section className="platform-members-shell">
        <header className="platform-members-nav">
          <button className="platform-members-brand" type="button" disabled={submitting} onClick={() => navigate("/projects")}>
            <span className="brand-mark">巡</span>
            <span><strong>巡检宝</strong><small>平台成员管理</small></span>
          </button>
          <Button icon={<ArrowLeft size={15} />} disabled={submitting} onClick={() => navigate("/projects")}>返回项目选择</Button>
        </header>

        <div className="platform-members-heading">
          <div>
            <p className="eyebrow">PLATFORM MEMBERS</p>
            <h1>平台成员管理</h1>
            <p>新增成员、分配可访问项目，并管理账号状态与密码。</p>
          </div>
          <Button type="primary" size="large" disabled={submitting || !projectsAvailable} loading={projects.loading} icon={<Plus size={17} />} onClick={openCreate}>新增成员</Button>
        </div>

        {projects.error ? <ApiResourceError error={projects.error} onRetry={projects.reload} /> : null}

        {members.error ? (
          <ApiResourceError error={members.error} onRetry={members.reload} />
        ) : (
          <section className="platform-members-table-card">
            <div className="platform-members-table-head">
              <div className="platform-members-table-icon"><Users size={21} /></div>
              <div><strong>成员账号</strong><span>共 {members.data.length} 名成员</span></div>
            </div>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={members.data}
              loading={members.loading}
              pagination={false}
              scroll={{ x: 1120 }}
            />
          </section>
        )}
      </section>

      <Modal
        title="新增成员"
        open={createOpen}
        okText="确认新增"
        cancelText="取消"
        confirmLoading={submitting}
        closable={!submitting}
        keyboard={!submitting}
        maskClosable={!submitting}
        cancelButtonProps={{ disabled: submitting }}
        okButtonProps={{ disabled: !projectsAvailable }}
        onOk={() => createForm.submit()}
        onCancel={closeCreate}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => void createMember(values)}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input /></Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: "请输入正确手机号" }]}><Input maxLength={11} /></Form.Item>
          <Form.Item name="username" label="登录账号" rules={[{ required: true, message: "请输入登录账号" }]}><Input autoComplete="off" /></Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}><Input type="password" autoComplete="new-password" /></Form.Item>
          <Form.Item name="projectIds" label="所属项目" rules={[{ required: true, type: "array", min: 1, message: "至少选择一个项目" }]}>
            <Select mode="multiple" disabled={submitting || !projectsAvailable} placeholder="选择一个或多个项目" options={projectOptions} loading={projects.loading} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑成员${editingMember ? `：${editingMember.name}` : ""}`}
        open={Boolean(editingMember)}
        okText="保存修改"
        cancelText="取消"
        confirmLoading={submitting}
        closable={!submitting}
        keyboard={!submitting}
        maskClosable={!submitting}
        cancelButtonProps={{ disabled: submitting }}
        okButtonProps={{ disabled: !projectsAvailable }}
        onOk={() => editForm.submit()}
        onCancel={closeEdit}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => void updateMember(values)}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input /></Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: "请输入正确手机号" }]}><Input maxLength={11} /></Form.Item>
          <Form.Item name="projectIds" label="所属项目" rules={[{ required: true, type: "array", min: 1, message: "至少选择一个项目" }]}>
            <Select mode="multiple" disabled={submitting || !projectsAvailable} placeholder="选择一个或多个项目" options={projectOptions} loading={projects.loading} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`重置密码${passwordMember ? `：${passwordMember.name}` : ""}`}
        open={Boolean(passwordMember)}
        okText="确认重置"
        cancelText="取消"
        confirmLoading={submitting}
        closable={!submitting}
        keyboard={!submitting}
        maskClosable={!submitting}
        cancelButtonProps={{ disabled: submitting }}
        onOk={() => passwordForm.submit()}
        onCancel={closePasswordReset}
        destroyOnHidden
      >
        <p className="platform-members-modal-note">设置新密码后，该成员已登录会话将失效。</p>
        <Form form={passwordForm} layout="vertical" onFinish={(values) => void resetPassword(values)}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}>
            <Input disabled={submitting} type="password" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
