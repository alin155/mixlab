import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@mixlab/ui-foundation";
import type { CutterLoginStatusValue } from "../../api.ts";

export interface CutterLoginGateProps {
  status: CutterLoginStatusValue;
  message?: string;
  deviceName?: string;
  onLogin: (input: { username: string; password: string }) => Promise<void> | void;
  onRegister: (input: { username: string; password: string }) => Promise<void> | void;
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

  return "请使用剪辑师账号登录。没有账号时先注册，管理员审核后即可进入。";
}

export function CutterLoginGate({ status, message, deviceName, onLogin, onRegister, children }: CutterLoginGateProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const isPending = status === "pending";
  const isDisabled = isApplying;
  const isRegister = mode === "register";

  if (status === "approved") {
    return <>{children}</>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password || isDisabled) {
      return;
    }

    setIsApplying(true);
    try {
      if (isRegister) {
        await onRegister({ username: trimmedUsername, password });
      } else {
        await onLogin({ username: trimmedUsername, password });
      }
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <main className="cutter-login-gate ml-auth-gate">
      <section className="cutter-login-panel ml-card ml-auth-panel">
        <h1>{isRegister ? "注册剪辑师账号" : "登录剪辑师工作台"}</h1>
        <p>{message ?? reasonForStatus(status)}</p>
        <p>
          当前设备：{deviceName ?? "剪辑工作站"}。注册后需要管理员在管理端审核。
        </p>
        <div className="cutter-login-tabs ml-segmented-control ml-segmented-control--equal" role="tablist" aria-label="登录方式">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={mode === "login" ? "is-active" : ""}
            onClick={() => setMode("login")}
          >
            登录
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={mode === "register" ? "is-active" : ""}
            onClick={() => setMode("register")}
          >
            注册
          </Button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="cutter-login-field ml-form-field">
            用户名
            <input
              className="ml-field-input"
              name="username"
              value={username}
              disabled={isDisabled}
              autoComplete="username"
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
          </label>
          <label className="cutter-login-field ml-form-field">
            密码
            <input
              className="ml-field-input"
              name="password"
              type="password"
              value={password}
              disabled={isDisabled}
              autoComplete={isRegister ? "new-password" : "current-password"}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          {isRegister ? <small>密码至少 8 位，并同时包含字母和数字。</small> : null}
          <Button type="submit" disabled={isDisabled || !username.trim() || !password} variant="primary">
            {isApplying ? "处理中..." : isRegister ? "注册并等待审核" : "登录"}
          </Button>
        </form>
        {isPending ? <p>账号已提交审核。审核通过后，使用用户名和密码登录即可进入。</p> : null}
      </section>
    </main>
  );
}
