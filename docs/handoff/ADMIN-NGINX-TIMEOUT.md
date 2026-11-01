# Admin 发布接口 504 修复交接

- 日期：2026-11-01
- 修改：`docker/nginx/admin-web.conf` 的 `/api/admin/` location 增加：
  - `proxy_connect_timeout 10s;`
  - `proxy_send_timeout 300s;`
  - `proxy_read_timeout 300s;`
- 提交：`dev/admin @ f8967af`

## 为什么需要重建/部署

该配置被打进 admin-web 镜像，仅修改仓库文件不会影响 NAS 上正在运行的容器。
需要 Admin 侧：
1. 以 `f8967af` 重建 admin-web/admin-api 镜像；
2. 部署候选到 NAS；
3. 调用一次耗时 >60s 的 `POST /api/admin/index/repair`，确认不再返回 504；
4. 验证 admin dashboard / release current / index 校验正常。

## 注意

- 当前 Mac 会话没有 NAS Docker/SSH 访问，无法直接部署；
- 本次未改变 Cutter 0.18.27；
- 发布接口仍建议后续异步化，300s 只是避免正常慢请求被误判失败。
