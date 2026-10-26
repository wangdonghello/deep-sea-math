# v3 服务器部署

## 访问地址

- v3 预览：<http://47.103.22.160:10010/v3/>
- 同机已有 chat-web 仍保持在 <http://47.103.22.160:10010/>

> 6000 端口是 SSH 端口，不能同时作为网站端口；网站挂在同机 nginx 的 10010 端口下。

## 服务器信息

- 主机：`47.103.22.160`
- SSH 端口：`6000`
- 登录用户：`wangdong`
- 静态目录：`/var/www/deep-sea-math-v3`
- Web 服务器：nginx，站点配置 `/etc/nginx/sites-available/chat-web`
- 修改前备份：`/etc/nginx/sites-available/chat-web.bak.v3`
- 客户端数据库：`deep-sea-math-v3`

## 发布步骤

```bash
VITE_BASE=/v3/ VITE_DB_NAME=deep-sea-math-v3 npm run build
tar -C dist -czf /tmp/v3-dist.tar.gz .
scp -P 6000 /tmp/v3-dist.tar.gz wangdong@47.103.22.160:/tmp/
# 服务器上：
sudo tar -xzf /tmp/v3-dist.tar.gz -C /var/www/deep-sea-math-v3
sudo systemctl reload nginx
```

nginx 中 `/v3/` 的 location 指向该目录，SPA 回退到 `/v3/index.html`。

## 家长 PIN 与 HTTP

服务器当前是 `http://IP:端口`，不属于浏览器安全上下文，`crypto.subtle` 不可用。
家长 PIN 的哈希会自动退回纯 JS SHA-256（`src/domain/crypto/sha256.ts`），
因此 HTTP 下也能设置/校验 PIN。后续若配置 HTTPS，会自动优先使用 Web Crypto。
