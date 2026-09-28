const { Blog, User, ChangeRequest } = require('../models');
const { PERMISSIONS } = require('../config/permissions');
const changeRequestService = require('../services/changeRequestService');
const { Op } = require('sequelize');

// Statuses considered "active" for an author —
// blogs from suspended/rejected/pending authors are hidden from normal users
const ACTIVE_AUTHOR_STATUSES = ['approved'];

// GET /blogs
exports.index = async (req, res) => {
  try {
    const page   = parseInt(req.query.page) || 1;
    const limit  = 9;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const userPerms  = req.session.permissions || [];
    const userId     = req.session.userId;
    const canViewAll = userPerms.includes(PERMISSIONS.VIEW_ALL_BLOGS);
    const canCreate  = userPerms.includes(PERMISSIONS.CREATE_BLOG);

    // ── Blog status filter ──────────────────────────────────────────────────
    let whereClause = {};

    if (canViewAll) {
      // Admins/super-admins: see every blog regardless of status or author status
      // (no whereClause restriction — they manage everything)
    } else if (canCreate) {
      // Writers: see all published blogs from active authors + their own drafts
      whereClause = {
        [Op.or]: [
          { status: 'published' },
          { authorId: userId, status: 'draft' }
        ]
      };
    } else {
      // Readers: only published blogs
      whereClause = { status: 'published' };
    }

    // ── Search filter ───────────────────────────────────────────────────────
    if (search) {
      const searchFilter = {
        [Op.or]: [
          { title:   { [Op.iLike]: `%${search}%` } },
          { content: { [Op.iLike]: `%${search}%` } }
        ]
      };
      whereClause = Object.keys(whereClause).length
        ? { [Op.and]: [whereClause, searchFilter] }
        : searchFilter;
    }

    // ── Author status filter ────────────────────────────────────────────────
    // Non-admins must not see blogs whose author is suspended / rejected / pending.
    // Admins can still see them (for content moderation).
    const authorWhere = canViewAll ? {} : { status: { [Op.in]: ACTIVE_AUTHOR_STATUSES } };

    const { count, rows: blogs } = await Blog.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'name', 'status'],
        where: authorWhere,
        // required:true so blogs whose author row is gone are excluded
        required: !canViewAll
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    // Which of these blogs currently have a pending change (update/delete)
    // awaiting a checker's decision? Used to render a small "pending" flag.
    const blogIds = blogs.map(b => b.id);
    let pendingBlogIds = new Set();
    if (blogIds.length) {
      const pending = await ChangeRequest.findAll({
        where: { entityType: 'Blog', entityId: { [Op.in]: blogIds }, status: 'pending' },
        attributes: ['entityId']
      });
      pendingBlogIds = new Set(pending.map(p => p.entityId));
    }

    res.render('blogs/index', {
      title: 'Blogs',
      blogs,
      search,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      totalBlogs: count,
      pendingBlogIds
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load blogs.' };
    res.redirect('/dashboard');
  }
};

// GET /blogs/create
exports.getCreate = (req, res) => {
  const formData = req.session.formData || {};
  delete req.session.formData;
  res.render('blogs/create', { title: 'Create Blog', formData });
};

// POST /blogs
// Nothing is written to the Blog table here — a ChangeRequest is submitted
// instead and must be approved by a checker before the post actually exists.
exports.create = async (req, res) => {
  try {
    const { title, content, status, tags } = req.body;
    const userPerms  = req.session.permissions || [];
    const canPublish = userPerms.includes(PERMISSIONS.PUBLISH_BLOG);
    const requestedStatus = (status === 'published' && canPublish) ? 'published' : 'draft';
    const tagsArray  = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (!title || !title.trim() || !content || !content.trim()) {
      req.session.flash = { type: 'error', message: 'Title and content are required.' };
      req.session.formData = req.body;
      return res.redirect('/blogs/create');
    }

    await changeRequestService.submit({
      entityType: 'Blog',
      entityId: null,
      action: 'create',
      payload: {
        title,
        content,
        status: requestedStatus,
        authorId: req.session.userId,
        tags: tagsArray,
        publishedAt: requestedStatus === 'published' ? new Date() : null
      },
      previousData: null,
      requestedBy: req.session.userId
    });

    req.session.flash = {
      type: 'success',
      message: 'Blog submitted for approval. It will go live once a checker approves it.'
    };
    res.redirect('/change-requests/mine');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to submit blog.' };
    req.session.formData = req.body;
    res.redirect('/blogs/create');
  }
};

// GET /blogs/:id
exports.show = async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id, {
      include: [{ model: User, as: 'author', attributes: ['id', 'name', 'bio', 'status'] }]
    });

    if (!blog) {
      req.session.flash = { type: 'error', message: 'Blog not found.' };
      return res.redirect('/blogs');
    }

    const userPerms  = req.session.permissions || [];
    const userId     = req.session.userId;
    const canViewAll = userPerms.includes(PERMISSIONS.VIEW_ALL_BLOGS);
    const isOwner    = blog.authorId === userId;

    // Check author account status — non-admins cannot view blogs from inactive authors
    // (owner can always see their own blogs)
    const authorInactive = blog.author &&
      !ACTIVE_AUTHOR_STATUSES.includes(blog.author.status);

    if (authorInactive && !canViewAll && !isOwner) {
      req.session.flash = { type: 'error', message: 'This blog is no longer available.' };
      return res.redirect('/blogs');
    }

    // Non-admins cannot see unpublished blogs from other people
    if (blog.status !== 'published' && !canViewAll && !isOwner) {
      req.session.flash = { type: 'error', message: 'Blog not found or not published.' };
      return res.redirect('/blogs');
    }

    // Surface any pending change on this exact blog (edit or delete request)
    // to the owner, admins, and checkers — the live content above stays as-is
    // until it's reviewed.
    const canReview = userPerms.includes(PERMISSIONS.APPROVE_CHANGE) || userPerms.includes(PERMISSIONS.REJECT_CHANGE);
    let pendingChange = null;
    if (isOwner || canViewAll || canReview) {
      pendingChange = await ChangeRequest.findOne({
        where: { entityType: 'Blog', entityId: blog.id, status: 'pending' },
        include: [{ model: User, as: 'requester', attributes: ['id', 'name'] }]
      });
    }

    res.render('blogs/show', { title: blog.title, blog, isOwner, pendingChange, canReview });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load blog.' };
    res.redirect('/blogs');
  }
};

// GET /blogs/:id/edit
exports.getEdit = async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) {
      req.session.flash = { type: 'error', message: 'Blog not found.' };
      return res.redirect('/blogs');
    }

    const userPerms  = req.session.permissions || [];
    const canViewAll = userPerms.includes(PERMISSIONS.VIEW_ALL_BLOGS);
    const isOwner    = blog.authorId === req.session.userId;

    if (!isOwner && !canViewAll) {
      req.session.flash = { type: 'error', message: 'You can only edit your own blogs.' };
      return res.redirect('/blogs');
    }

    // Only one pending change allowed per blog at a time.
    if (await changeRequestService.hasPendingRequest('Blog', blog.id)) {
      req.session.flash = {
        type: 'warning',
        message: 'This post already has a change request awaiting review. You can submit a new edit once it is resolved.'
      };
      return res.redirect(`/blogs/${blog.id}`);
    }

    const formData = req.session.formData || {};
    delete req.session.formData;
    res.render('blogs/edit', { title: 'Edit Blog', blog, formData });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load blog for editing.' };
    res.redirect('/blogs');
  }
};

// PUT /blogs/:id
// The live blog row is left untouched — an update ChangeRequest is queued.
exports.update = async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) {
      req.session.flash = { type: 'error', message: 'Blog not found.' };
      return res.redirect('/blogs');
    }

    const userPerms  = req.session.permissions || [];
    const canViewAll = userPerms.includes(PERMISSIONS.VIEW_ALL_BLOGS);
    const isOwner    = blog.authorId === req.session.userId;

    if (!isOwner && !canViewAll) {
      req.session.flash = { type: 'error', message: 'Unauthorized action.' };
      return res.redirect('/blogs');
    }

    const { title, content, status, tags } = req.body;
    const canPublish = userPerms.includes(PERMISSIONS.PUBLISH_BLOG);
    const requestedStatus = (status === 'published' && canPublish)
      ? 'published'
      : (status === 'draft' ? 'draft' : blog.status);
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    await changeRequestService.submit({
      entityType: 'Blog',
      entityId: blog.id,
      action: 'update',
      payload: {
        title,
        content,
        status: requestedStatus,
        tags: tagsArray,
        publishedAt: requestedStatus === 'published' && !blog.publishedAt ? new Date() : blog.publishedAt
      },
      previousData: {
        title: blog.title,
        content: blog.content,
        status: blog.status,
        tags: blog.tags,
        publishedAt: blog.publishedAt
      },
      requestedBy: req.session.userId
    });

    req.session.flash = {
      type: 'success',
      message: 'Your edit was submitted for approval. The published version stays live until a checker reviews it.'
    };
    res.redirect(`/blogs/${blog.id}`);
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to submit blog update.' };
    req.session.formData = req.body;
    res.redirect(`/blogs/${req.params.id}/edit`);
  }
};

// DELETE /blogs/:id
// Deleting never happens immediately — it becomes a pending delete request.
exports.delete = async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) {
      req.session.flash = { type: 'error', message: 'Blog not found.' };
      return res.redirect('/blogs');
    }

    const userPerms  = req.session.permissions || [];
    const canViewAll = userPerms.includes(PERMISSIONS.VIEW_ALL_BLOGS);
    const isOwner    = blog.authorId === req.session.userId;

    if (!isOwner && !canViewAll) {
      req.session.flash = { type: 'error', message: 'Unauthorized action.' };
      return res.redirect('/blogs');
    }

    await changeRequestService.submit({
      entityType: 'Blog',
      entityId: blog.id,
      action: 'delete',
      payload: null,
      previousData: { title: blog.title, status: blog.status },
      requestedBy: req.session.userId
    });

    req.session.flash = {
      type: 'success',
      message: 'Delete request submitted for approval. The post remains live until a checker approves it.'
    };
    res.redirect(`/blogs/${blog.id}`);
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to submit delete request.' };
    res.redirect('/blogs');
  }
};
