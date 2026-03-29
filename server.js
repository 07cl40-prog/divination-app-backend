// backend/server.js - DivineHub 完整后端服务器

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 中间件
app.use(cors());
app.use(express.json());

// MongoDB 连接
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/divineHub', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ==================== 数据库模型 ====================

// 用户模型
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: String,
  avatar: String,
  role: { type: String, enum: ['user', 'diviner', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

// 算命先生模型
const divinersSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: String,
  title: String,
  avatar: String,
  bio: String,
  specialty: [String],
  price: Number,
  responseTime: String,
  
  // 评分相关
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  
  // 信用指数
  creditScore: { type: Number, default: 50 },
  publicQACount: { type: Number, default: 0 },
  
  // 统计数据
  totalOrders: { type: Number, default: 0 },
  completedOrders: { type: Number, default: 0 },
  responseRate: { type: Number, default: 0 },
  
  // 状态
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Diviner = mongoose.model('Diviner', divinersSchema);

// 预约模型
const appointmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  divinerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Diviner', required: true },
  
  serviceType: String,
  scheduledTime: Date,
  duration: Number,
  price: Number,
  
  paymentStatus: { type: String, enum: ['pending', 'completed', 'refunded'], default: 'pending' },
  paymentMethod: String,
  transactionId: String,
  
  videoUrl: String,
  videoStartTime: Date,
  videoEndTime: Date,
  
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// 评价模型
const reviewSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  divinerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Diviner', required: true },
  
  overallRating: { type: Number, min: 1, max: 5, required: true },
  
  dimensions: {
    accuracy: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 },
    professionalism: { type: Number, min: 1, max: 5 },
    punctuality: { type: Number, min: 1, max: 5 },
    valueForMoney: { type: Number, min: 1, max: 5 },
  },
  
  title: String,
  content: String,
  tags: [String],
  images: [String],
  
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Review = mongoose.model('Review', reviewSchema);

// 公益问答模型
const publicQASchema = new mongoose.Schema({
  divinerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Diviner', required: true },
  
  question: String,
  category: String,
  
  answer: String,
  answerTime: Date,
  
  helpfulCount: { type: Number, default: 0 },
  creditPoints: { type: Number, default: 5 },
  
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const PublicQA = mongoose.model('PublicQA', publicQASchema);

// 信用历史模型
const creditHistorySchema = new mongoose.Schema({
  divinerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Diviner', required: true },
  
  points: Number,
  reason: { type: String, enum: ['public_qa', 'review', 'complaint', 'refund'] },
  relatedId: mongoose.Schema.Types.ObjectId,
  
  createdAt: { type: Date, default: Date.now },
});

const CreditHistory = mongoose.model('CreditHistory', creditHistorySchema);

// ==================== 认证中间件 ====================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ==================== 用户认证 API ====================

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: '用户已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      role: role || 'user',
    });

    await user.save();

    // 如果是算命先生，创建先生资料
    if (role === 'diviner') {
      const diviner = new Diviner({
        userId: user._id,
        name: username,
      });
      await diviner.save();
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, username, email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: '用户不存在' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: '密码错误' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, username: user.username, email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 算命先生 API ====================

// 获取先生列表
app.get('/api/diviners', async (req, res) => {
  try {
    const { sort = 'rating', page = 1, limit = 10 } = req.query;
    
    const sortOptions = {
      'rating': { rating: -1 },
      'credit': { creditScore: -1 },
      'new': { createdAt: -1 },
    };

    const diviners = await Diviner.find({ status: 'active' })
      .sort(sortOptions[sort] || sortOptions['rating'])
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('userId', 'username avatar');

    const total = await Diviner.countDocuments({ status: 'active' });

    res.json({ diviners, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取先生详情
app.get('/api/diviners/:id', async (req, res) => {
  try {
    const diviner = await Diviner.findById(req.params.id).populate('userId', 'username avatar');
    if (!diviner) {
      return res.status(404).json({ error: '先生不存在' });
    }

    // 获取评价统计
    const reviews = await Review.find({ divinerId: req.params.id, status: 'approved' });
    const avgRating = reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length).toFixed(1)
      : 0;

    res.json({
      ...diviner.toObject(),
      reviews: reviews.slice(0, 5),
      averageRating: avgRating,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新先生信息
app.put('/api/diviners/:id', authenticateToken, async (req, res) => {
  try {
    const diviner = await Diviner.findById(req.params.id);
    if (!diviner) {
      return res.status(404).json({ error: '先生不存在' });
    }

    // 检查权限
    if (diviner.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: '无权限修改' });
    }

    Object.assign(diviner, req.body);
    await diviner.save();

    res.json(diviner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 预约 API ====================

// 创建预约
app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const { divinerId, serviceType, scheduledTime, duration, price } = req.body;

    const appointment = new Appointment({
      userId: req.user.userId,
      divinerId,
      serviceType,
      scheduledTime: new Date(scheduledTime),
      duration,
      price,
    });

    await appointment.save();

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取我的预约
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user.userId })
      .populate('divinerId', 'name avatar title')
      .sort({ createdAt: -1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 支付预约
app.post('/api/appointments/:id/payment', authenticateToken, async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: '预约不存在' });
    }

    // 创建 Stripe 支付
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(appointment.price * 100),
      currency: 'hkd',
      payment_method: paymentMethodId,
      confirm: true,
    });

    if (paymentIntent.status === 'succeeded') {
      appointment.paymentStatus = 'completed';
      appointment.transactionId = paymentIntent.id;
      appointment.status = 'confirmed';
      await appointment.save();

      // 更新先生的订单数
      await Diviner.findByIdAndUpdate(
        appointment.divinerId,
        { $inc: { totalOrders: 1 } }
      );

      res.json({ success: true, appointment });
    } else {
      res.status(400).json({ error: '支付失败' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 完成预约
app.post('/api/appointments/:id/complete', authenticateToken, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: '预约不存在' });
    }

    appointment.status = 'completed';
    appointment.videoEndTime = new Date();
    await appointment.save();

    // 更新先生的完成订单数
    await Diviner.findByIdAndUpdate(
      appointment.divinerId,
      { $inc: { completedOrders: 1 } }
    );

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 评价 API ====================

// 创建评价
app.post('/api/reviews', authenticateToken, async (req, res) => {
  try {
    const { appointmentId, divinerId, overallRating, dimensions, title, content, tags } = req.body;

    const review = new Review({
      appointmentId,
      userId: req.user.userId,
      divinerId,
      overallRating,
      dimensions,
      title,
      content,
      tags,
    });

    await review.save();

    // 更新先生的评分
    const allReviews = await Review.find({ divinerId, status: 'approved' });
    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.overallRating, 0) / allReviews.length
      : 0;

    await Diviner.findByIdAndUpdate(divinerId, {
      rating: avgRating,
      reviewCount: allReviews.length,
    });

    // 添加信用历史
    const creditPoints = overallRating >= 4 ? 3 : (overallRating >= 3 ? 1 : -2);
    const creditHistory = new CreditHistory({
      divinerId,
      points: creditPoints,
      reason: 'review',
      relatedId: review._id,
    });
    await creditHistory.save();

    // 更新先生的信用指数
    const diviner = await Diviner.findById(divinerId);
    diviner.creditScore = Math.max(0, Math.min(100, diviner.creditScore + creditPoints));
    await diviner.save();

    res.json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取先生的评价
app.get('/api/diviners/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ divinerId: req.params.id, status: 'approved' })
      .populate('userId', 'username avatar')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 公益问答 API ====================

// 获取公益问答列表
app.get('/api/public-qa', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const qaList = await PublicQA.find({ status: 'approved' })
      .populate('divinerId', 'name avatar title')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PublicQA.countDocuments({ status: 'approved' });

    res.json({ qaList, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建公益问答
app.post('/api/public-qa', authenticateToken, async (req, res) => {
  try {
    const { question, category } = req.body;

    // 获取先生信息
    const diviner = await Diviner.findOne({ userId: req.user.userId });
    if (!diviner) {
      return res.status(400).json({ error: '只有算命先生可以参加公益问答' });
    }

    const qa = new PublicQA({
      divinerId: diviner._id,
      question,
      category,
    });

    await qa.save();

    res.json(qa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 回答问题
app.post('/api/public-qa/:id/answer', authenticateToken, async (req, res) => {
  try {
    const { answer } = req.body;
    const qa = await PublicQA.findById(req.params.id);

    if (!qa) {
      return res.status(404).json({ error: '问题不存在' });
    }

    qa.answer = answer;
    qa.answerTime = new Date();
    qa.status = 'approved';
    await qa.save();

    // 添加信用历史
    const creditHistory = new CreditHistory({
      divinerId: qa.divinerId,
      points: qa.creditPoints,
      reason: 'public_qa',
      relatedId: qa._id,
    });
    await creditHistory.save();

    // 更新先生的信用指数和公益问答次数
    const diviner = await Diviner.findById(qa.divinerId);
    diviner.creditScore = Math.min(100, diviner.creditScore + qa.creditPoints);
    diviner.publicQACount += 1;
    await diviner.save();

    res.json(qa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 标记有帮助
app.post('/api/public-qa/:id/helpful', async (req, res) => {
  try {
    const qa = await PublicQA.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpfulCount: 1 } },
      { new: true }
    );

    res.json(qa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 信用指数 API ====================

// 获取信用指数
app.get('/api/credit/:divinerId', async (req, res) => {
  try {
    const diviner = await Diviner.findById(req.params.divinerId);
    if (!diviner) {
      return res.status(404).json({ error: '先生不存在' });
    }

    // 计算信用等级
    let creditLevel = '普通';
    if (diviner.creditScore >= 90) creditLevel = '钻石';
    else if (diviner.creditScore >= 75) creditLevel = '金牌';
    else if (diviner.creditScore >= 60) creditLevel = '银牌';

    res.json({
      creditScore: diviner.creditScore,
      creditLevel,
      publicQACount: diviner.publicQACount,
      totalOrders: diviner.totalOrders,
      completedOrders: diviner.completedOrders,
      rating: diviner.rating,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取信用历史
app.get('/api/credit/:divinerId/history', async (req, res) => {
  try {
    const history = await CreditHistory.find({ divinerId: req.params.divinerId })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 健康检查 ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 DivineHub 后端服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 MongoDB 已连接`);
});
