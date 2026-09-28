const sequelize = require('../config/database');
const User = require('./User');
const Blog = require('./Blog');
const ChangeRequest = require('./ChangeRequest');

// Associations
User.hasMany(Blog, { foreignKey: 'authorId', as: 'blogs' });
Blog.belongsTo(User, { foreignKey: 'authorId', as: 'author' });

// Maker-checker associations
User.hasMany(ChangeRequest, { foreignKey: 'requestedBy', as: 'submittedChanges' });
ChangeRequest.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });
User.hasMany(ChangeRequest, { foreignKey: 'reviewedBy', as: 'reviewedChanges' });
ChangeRequest.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer' });

module.exports = { sequelize, User, Blog, ChangeRequest };
