const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ApprovalRequest = sequelize.define('ApprovalRequest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  // Who made the request
  makerId: { type: DataTypes.INTEGER, allowNull: false },

  // Who checked it (null until acted on)
  checkerId: { type: DataTypes.INTEGER, allowNull: true },

  // Action type: blog_create | blog_update | blog_delete | blog_publish | user_update | user_delete
  action: { type: DataTypes.STRING(50), allowNull: false },

  // Human-readable summary shown in the checker panel
  summary: { type: DataTypes.STRING(500), allowNull: false },

  // Target blog (if action is blog-related)
  blogId: { type: DataTypes.INTEGER, allowNull: true },

  // Full payload needed to execute the action on approval
  // For blog actions: { blogId?, title, content, status, tags, authorId }
  // For user actions: { userId, status, role, permissions }
  payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

  // Original data snapshot (for showing diff to checker)
  originalData: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },

  // pending | approved | rejected
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
  },

  // Checker's comment when approving or rejecting
  checkerComment: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'approval_requests',
  timestamps: true,
});

module.exports = ApprovalRequest;
