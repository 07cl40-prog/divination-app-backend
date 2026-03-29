# 🔮 DivineHub 后端服务器

完整的在线算命平台后端 API

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 配置环境变量
编辑 `.env` 文件，配置以下变量：
- `MONGODB_URI` - MongoDB 连接字符串
- `JWT_SECRET` - JWT 密钥
- `STRIPE_SECRET_KEY` - Stripe API 密钥
- `PORT` - 服务器端口（默认 5000）

### 启动服务器
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## 📚 API 文档

### 用户认证
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录

### 先生管理
- `GET /api/diviners` - 获取先生列表
- `GET /api/diviners/:id` - 获取先生详情
- `PUT /api/diviners/:id` - 更新先生信息
- `GET /api/diviners/:id/reviews` - 获取先生评价

### 预约系统
- `POST /api/appointments` - 创建预约
- `GET /api/appointments` - 获取我的预约
- `POST /api/appointments/:id/payment` - 支付预约
- `POST /api/appointments/:id/complete` - 完成预约

### 评价系统
- `POST /api/reviews` - 创建评价
- `GET /api/diviners/:id/reviews` - 获取先生评价

### 公益问答
- `GET /api/public-qa` - 获取公益问答列表
- `POST /api/public-qa` - 创建公益问答
- `POST /api/public-qa/:id/answer` - 回答问题
- `POST /api/public-qa/:id/helpful` - 标记有帮助

### 信用指数
- `GET /api/credit/:divinerId` - 获取信用指数
- `GET /api/credit/:divinerId/history` - 获取信用历史

## 🛠️ 技术栈

- Node.js + Express
- MongoDB
- JWT 认证
- Stripe 支付
- Bcrypt 密码加密

## 📝 许可证

MIT
