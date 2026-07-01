# 臻林客户对账系统部署说明

本项目作为独立应用部署，不覆盖、不修改已有的“臻林面料订单管理系统”。

## 生产规划

- 后端端口：`4100`
- 前端目录：`/var/www/reconciliation-os`
- PM2 应用名：`reconciliation-api`
- Nginx 域名示例：`account.example.com`
- 认证数据文件：建议放在 `/var/lib/reconciliation-os/auth-db.json`

## 环境变量

复制 `.env.example` 为 `.env`，生产环境必须修改 `JWT_SECRET`。

```bash
PORT=4100
NODE_ENV=production
JWT_SECRET=please_change_this_to_a_long_random_secret
AUTH_DATA_FILE=/var/lib/reconciliation-os/auth-db.json
FRONTEND_URL=https://account.example.com
VITE_API_BASE_URL=/api
```

## GitHub 上传

```bash
git status
git add .
git commit -m "Deploy reconciliation system"
git branch -M main
git remote add origin <你的GitHub仓库地址>
git push -u origin main
```

如果已经添加过 remote：

```bash
git remote set-url origin <你的GitHub仓库地址>
git push -u origin main
```

## 服务器部署

```bash
cd /opt
git clone <你的GitHub仓库地址> reconciliation-os
cd reconciliation-os
npm install
cp .env.example .env
nano .env
```

创建持久化目录：

```bash
sudo mkdir -p /var/lib/reconciliation-os
sudo chown -R $USER:$USER /var/lib/reconciliation-os
```

构建前端：

```bash
npm run build
```

部署前端静态文件：

```bash
sudo mkdir -p /var/www/reconciliation-os
sudo rm -rf /var/www/reconciliation-os/*
sudo cp -r dist/* /var/www/reconciliation-os/
```

启动后端：

```bash
pm2 start npm --name reconciliation-api -- start
pm2 save
```

## Nginx

创建新配置，不要覆盖旧系统配置：

```bash
sudo nano /etc/nginx/sites-available/reconciliation-os
```

配置内容参考：

```nginx
server {
    listen 80;
    server_name account.example.com;

    root /var/www/reconciliation-os;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4100/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/reconciliation-os /etc/nginx/sites-enabled/reconciliation-os
sudo nginx -t
sudo systemctl reload nginx
```

## 测试

```bash
curl http://127.0.0.1:4100/api/auth/me
```

未带 token 返回 401 是正常的。浏览器访问：

```text
http://account.example.com
```

## 部署后检查

1. 是否能打开登录页。
2. 未登录访问业务页是否跳转登录页。
3. 默认管理员是否能登录。
4. 同一账号二次登录是否会挤掉旧页面。
5. 客户资料是否正常保存。
6. 客户对账是否正常保存。
7. 收款池是否正常保存。
8. 对账单预览、打印、Word 导出是否正常。
9. 刷新 `/reconciliation` 是否不会 404。
10. `pm2 restart reconciliation-api` 后系统是否仍能访问。
11. `sudo systemctl reload nginx` 后系统是否仍能访问。

## 备份建议

当前认证数据文件由 `AUTH_DATA_FILE` 指定。建议每天备份：

```bash
sudo mkdir -p /var/backups/reconciliation-os
sudo cp /var/lib/reconciliation-os/auth-db.json /var/backups/reconciliation-os/auth-db-$(date +%F).json
```

可以加入 crontab：

```bash
0 2 * * * cp /var/lib/reconciliation-os/auth-db.json /var/backups/reconciliation-os/auth-db-$(date +\%F).json
```

## 注意

当前客户对账业务数据仍保存在浏览器 localStorage 中；登录鉴权由后端控制，但业务数据还没有迁移到后端数据库。若需要多电脑共享客户资料、对账单、收款池等业务数据，下一阶段需要把业务数据迁移到后端数据库。
