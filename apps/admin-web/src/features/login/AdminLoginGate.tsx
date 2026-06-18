import { type FormEvent, type ReactNode, useState } from "react";

export interface AdminLoginGateProps {
  mode: "register" | "login";
  loading?: boolean;
  error?: string;
  onRegister(input: { username: string; password: string; display_name?: string }): Promise<void> | void;
  onLogin(input: { username: string; password: string }): Promise<void> | void;
  children?: ReactNode;
}

export function AdminLoginGate({
  mode,
  loading = false,
  error = "",
  onRegister,
  onLogin,
  children
}: AdminLoginGateProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";
  const disabled = loading || isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password || disabled) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegister) {
        await onRegister({
          username: trimmedUsername,
          password,
          display_name: displayName.trim() || undefined
        });
      } else {
        await onLogin({
          username: trimmedUsername,
          password
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-auth-app">
      <section className="admin-auth-panel" aria-label={isRegister ? "创建管理员账号" : "登录管理端"}>
        <div className="admin-auth-brand">
          <span className="admin-auth-mark">ML</span>
          <span>
            <strong>MixLab Admin</strong>
            <small>公共素材库管理</small>
          </span>
        </div>
        <h1>{isRegister ? "创建第一个管理员" : "登录管理端"}</h1>
        <p>{isRegister ? "首次使用需要创建管理员账号，后续管理端操作都会使用该账号登录。" : "请输入管理员账号和密码继续管理公共素材库。"}</p>
        <form className="admin-auth-form" onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              autoComplete="username"
              value={username}
              disabled={disabled}
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
          </label>
          {isRegister ? (
            <label>
              显示名称
              <input
                autoComplete="name"
                value={displayName}
                disabled={disabled}
                placeholder="可选"
                onChange={(event) => setDisplayName(event.currentTarget.value)}
              />
            </label>
          ) : null}
          <label>
            密码
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              disabled={disabled}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          {isRegister ? <small className="admin-auth-help">至少 8 位，并同时包含字母和数字。</small> : null}
          {error ? <p className="admin-auth-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={disabled || !username.trim() || !password}>
            {disabled ? "处理中..." : isRegister ? "创建并进入" : "登录"}
          </button>
        </form>
        {children}
      </section>
    </main>
  );
}
