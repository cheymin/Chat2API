# Docker 构建指南

本文档说明如何构建和使用 Chat2API Manager 的 Docker 镜像。

## 快速开始

### 拉取镜像

```bash
# 从 GitHub Packages 拉取最新版本
docker pull ghcr.io/xiaoy233/chat2api:latest

# 拉取特定版本
docker pull ghcr.io/xiaoy233/chat2api:1.4.0
```

### 运行容器

```bash
# 基本运行
docker run -d \
  --name chat2api \
  -p 8787:8787 \
  ghcr.io/xiaoy233/chat2api:latest

# 带持久化存储
docker run -d \
  --name chat2api \
  -p 8787:8787 \
  -v chat2api-data:/root/.chat2api \
  ghcr.io/xiaoy233/chat2api:latest
```

### 使用 Docker Compose

创建 `docker-compose.yml` 文件:

```yaml
version: '3.8'

services:
  chat2api:
    image: ghcr.io/xiaoy233/chat2api:latest
    container_name: chat2api
    ports:
      - "8787:8787"
    volumes:
      - chat2api-data:/root/.chat2api
    restart: unless-stopped
    environment:
      - NODE_ENV=production

volumes:
  chat2api-data:
    driver: local
```

启动服务:

```bash
docker-compose up -d
```

## 本地构建

### 构建镜像

```bash
# 构建默认镜像
docker build -t chat2api:local .

# 构建特定平台
docker buildx build --platform linux/amd64,linux/arm64 -t chat2api:local .
```

### 运行本地构建

```bash
docker run -d \
  --name chat2api \
  -p 8787:8787 \
  chat2api:local
```

## 配置说明

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `production` | 运行环境 |
| `DISPLAY` | `:99` | Xvfb 显示端口 |

### 数据持久化

应用数据存储在 `/root/.chat2api` 目录,包含:
- `config.json` - 应用配置
- `providers.json` - 供应商设置
- `accounts.json` - 账户凭证(加密)
- `logs/` - 请求日志

建议挂载此目录以持久化数据:

```bash
docker run -d \
  -v /path/to/chat2api:/root/.chat2api \
  -p 8787:8787 \
  ghcr.io/xiaoy233/chat2api:latest
```

### 端口映射

| 端口 | 说明 |
|------|------|
| `8787` | API 代理服务端口 |

## 访问服务

容器启动后,通过以下方式访问 API:

```bash
# 测试连接
curl http://localhost:8787/v1/models

# 使用 API
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## GitHub Actions 自动构建

本项目配置了自动化 Docker 镜像构建流程:

### 触发条件

1. **推送标签**: 推送 `v*.*.*` 格式的标签时触发
2. **分支推送**: 推送到 `main` 或 `master` 分支时触发
3. **手动触发**: 通过 GitHub Actions 界面手动运行

### 镜像标签策略

- `latest` - 最新稳定版本
- `v1.4.0` - 完整版本号
- `v1.4` - 主版本号
- `main` - 主分支最新构建

### 发布流程

1. **创建标签**:
   ```bash
   git tag v1.4.0
   git push origin v1.4.0
   ```

2. **自动构建**: GitHub Actions 自动构建并推送镜像到 GitHub Packages

3. **验证镜像**:
   ```bash
   docker pull ghcr.io/xiaoy233/chat2api:v1.4.0
   ```

## 技术细节

### 多阶段构建

Dockerfile 使用多阶段构建优化镜像大小:

1. **Builder 阶段**: 安装依赖、构建应用
2. **Production 阶段**: 仅包含运行时必需文件

### Xvfb 虚拟显示

Electron 应用在 Docker 容器中需要虚拟显示环境。容器启动时会自动启动 Xvfb。

### 架构支持

镜像支持以下平台:
- `linux/amd64` - 64位 Intel/AMD
- `linux/arm64` - 64位 ARM (Apple Silicon, AWS Graviton等)

## 故障排查

### 容器无法启动

检查日志:
```bash
docker logs chat2api
```

### API 无响应

1. 检查端口映射:
   ```bash
   docker port chat2api
   ```

2. 检查健康状态:
   ```bash
   docker inspect --format='{{.State.Health.Status}}' chat2api
   ```

### 数据持久化问题

确保正确挂载卷:
```bash
docker inspect chat2api --format='{{json .Mounts}}'
```

## 相关链接

- [GitHub Packages](https://github.com/xiaoY233/Chat2API/pkgs/container/chat2api)
- [Docker Hub](https://hub.docker.com/) (如需推送到 Docker Hub)
- [项目主页](https://github.com/xiaoY233/Chat2API)