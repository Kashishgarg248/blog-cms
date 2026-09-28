const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * A ChangeRequest is the "pending" version of a CRUD action.
 *
 * Nothing ever writes directly to Blog/User from a controller anymore for
 * create/update/delete — instead a ChangeRequest row is created holding the
 * proposed change. The real Blog/User row is only touched once a Checker
 * (someone holding APPROVE_CHANGE) approves it — see services/changeRequestService.js.
 */
const ChangeRequest = sequelize.define('ChangeRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  entityType: {
    type: DataTypes.ENUM('Blog', 'User'),
    allowNull: false
  },
  entityId: {
    type: DataTypes.INTEGER,
    allowNull: true // null for 'create' actions — the record doesn't exist yet
  },
  action: {
    type: DataTypes.ENUM('create', 'update', 'delete'),
    allowNull: false
  },
  // Proposed new field values (create/update). Null for delete.
  payload: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  // Snapshot of the affected fields BEFORE the change, for diff display.
  // Null for 'create' (nothing existed before).
  previousData: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
    allowNull: false
  },
  requestedBy: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  reviewedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  reviewNote: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // A short human label so queue/diff views don't need to re-derive
  // "what is this about" from raw payload (e.g. blog title, user email).
  summary: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'change_requests',
  timestamps: true,
  indexes: [
    { fields: ['entityType', 'entityId', 'status'] },
    { fields: ['status'] }
  ]
});

module.exports = ChangeRequest;
