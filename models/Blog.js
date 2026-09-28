const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Blog = sequelize.define('Blog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true, len: [3, 255] }
  },
  slug: {
    type: DataTypes.STRING(300),
    unique: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { notEmpty: true }
  },
  excerpt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'archived'),
    defaultValue: 'draft'
  },
  authorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  coverImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'blogs',
  timestamps: true,
  hooks: {
    beforeCreate: (blog) => {
      if (!blog.slug) {
        blog.slug = blog.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim() + '-' + Date.now();
      }
      if (!blog.excerpt && blog.content) {
        blog.excerpt = blog.content.replace(/<[^>]*>/g, '').substring(0, 200) + '...';
      }
    },
    beforeUpdate: (blog) => {
      if (blog.changed('title') && !blog.changed('slug')) {
        blog.slug = blog.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim() + '-' + Date.now();
      }
      if (blog.changed('content') && blog.content) {
        blog.excerpt = blog.content.replace(/<[^>]*>/g, '').substring(0, 200) + '...';
      }
    }
  }
});

module.exports = Blog;
