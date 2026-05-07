import { type FormEvent, type ReactNode, useState } from "react";
import type { CutterLoginStatusValue } from "../../api.ts";

export interface CutterLoginGateProps {
  status: CutterLoginStatusValue;
  message?: string;
  deviceName?: string;
  onApply: (username: string) => Promise<void> | void;
  children: ReactNode;
}

function reasonForStatus(status: CutterLoginStatusValue): string {
  if (status === "pending") {
    return "申请已提交，请等待管理员审核。";
  }

  if (status === "rejected") {
    return "申请未通过，请联系管理员。";
  }

  if (status === "disabled") {
    return "账号已停用，请联系管理员。";
  }

  return "请输入用户名，提交后由管理员审核。";
}

export function CutterLoginGate({ status, message, deviceName, onApply, children }: CutterLoginGateProps) {
  const [username, setUsername] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const isPending = status === "pending";
  const isDisabled = isPending || isApplying;

  if (status === "approved") {
    return <>{children}</>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUsername = username.trim();
    if (!trimmedUsername || isDisabled) {
      return;
    }

    setIsApplying(true);
    try {
      await onApply(trimmedUsername);
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <main className="cutter-login-gate">
      <section className="cutter-login-panel">
        <h1>申请使用剪辑师工作台</h1>
        <p>{message ?? reasonForStatus(status)}</p>
        <p>
          身份方式：用户名 + 本机设备令牌。当前设备：{deviceName ?? "剪辑工作站"}。
          IP 只用于诊断，不作为登录身份。
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              name="username"
              value={username}
              disabled={isDisabled}
              autoComplete="username"
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
          </label>
          <button type="submit" disabled={isDisabled}>
            提交申请
          </button>
        </form>
      </section>
    </main>
  );
}
