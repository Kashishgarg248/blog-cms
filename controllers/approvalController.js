const { ApprovalRequest, User, Blog } = require('../models');
const { APPROVAL_ACTIONS, REQUIRES_APPROVAL, ROLE_PERMISSIONS, ROLES } = require('../config/permissions');
const { Op } = require('sequelize');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Does this user's role require maker-checker for write actions?
 * Super-admins are exempt — their actions execute immediately.
 */
const needsApproval = (userRole) => REQUIRES_APPROVAL.includes(userRole);

/**
 * Create an approval request and return it.
 * Called instead of executing the action directly.
 */
const createRequest = async ({ makerId, action, summary, payload, originalData = null, blogId = null }) => {
  return ApprovalRequest.create({ makerId, action, summary, payload, originalData, blogId, status: 'pending' });
};

// ── Checker panel ─────────────────────────────────────────────────────────────

// GET /approvals
exports.getList = async (req, res) => {
  try {
    const filter = req.query.filter || 'pending';
    const where  = filter === 'all' ? {} : { status: filter };

    const requests = await ApprovalRequest.findAll({
      where,
      include: [
        { model: User, as: 'maker',   attributes: ['id', 'name', 'email', 'role'] },
        { model: User, as: 'checker', attributes: ['id', 'name'] },
        { model: Blog, as: 'blog',    attributes: ['id', 'title', 'status'], required: false },
      ],
      order: [['createdAt', 'DESC']],
    });

    const counts = {
      all:      await ApprovalRequest.count(),
      pending:  await ApprovalRequest.count({ where: { status: 'pending' } }),
      approved: await ApprovalRequest.count({ where: { status: 'approved' } }),
      rejected: await ApprovalRequest.count({ where: { status: 'rejected' } }),
    };

    res.render('approvals/list', {
      title: 'Approval Requests',
      requests,
      filter,
      counts,
      APPROVAL_ACTIONS,
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load approval requests.' };
    res.redirect('/dashboard');
  }
};

// GET /approvals/:id
exports.getDetail = async (req, res) => {
  try {
    const request = await ApprovalRequest.findByPk(req.params.id, {
      include: [
        { model: User, as: 'maker',   attributes: ['id', 'name', 'email', 'role'] },
        { model: User, as: 'checker', attributes: ['id', 'name'] },
        { model: Blog, as: 'blog',    required: false },
      ],
    });

    if (!request) {
      req.session.flash = { type: 'error', message: 'Request not found.' };
      return res.redirect('/approvals');
    }

    res.render('approvals/detail', {
      title: `Approval: ${request.action}`,
      request,
      APPROVAL_ACTIONS,
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load request.' };
    res.redirect('/approvals');
  }
};

// POST /approvals/:id/approve
exports.approve = async (req, res) => {
  try {
    const request = await ApprovalRequest.findByPk(req.params.id, {
      include: [{ model: Blog, as: 'blog', required: false }]
    });

    if (!request || request.status !== 'pending') {
      req.session.flash = { type: 'error', message: 'Request not found or already processed.' };
      return res.redirect('/approvals');
    }

    const { checkerComment } = req.body;
    const payload = request.payload;

    // ── Execute the action ────────────────────────────────────────────────
    if (request.action === APPROVAL_ACTIONS.BLOG_CREATE) {
      await Blog.create({
        title:     payload.title,
        content:   payload.content,
        status:    payload.publishAfterApproval ? 'published' : 'draft',
        tags:      payload.tags || [],
        authorId:  payload.authorId,
        publishedAt: payload.publishAfterApproval ? new Date() : null,
      });

    } else if (request.action === APPROVAL_ACTIONS.BLOG_UPDATE) {
      const blog = await Blog.findByPk(payload.blogId);
      if (blog) {
        await blog.update({
          title:   payload.title,
          content: payload.content,
          tags:    payload.tags || [],
          status:  payload.status || blog.status,
        });
      }

    } else if (request.action === APPROVAL_ACTIONS.BLOG_DELETE) {
      const blog = await Blog.findByPk(payload.blogId);
      if (blog) await blog.destroy();

    } else if (request.action === APPROVAL_ACTIONS.BLOG_PUBLISH) {
      const blog = await Blog.findByPk(payload.blogId);
      if (blog) await blog.update({ status: 'published', publishedAt: new Date() });

    } else if (request.action === APPROVAL_ACTIONS.USER_UPDATE) {
      const user = await User.findByPk(payload.userId);
      if (user) {
        await user.update({
          status:      payload.status,
          role:        payload.role,
          permissions: payload.permissions,
        });
      }

    } else if (request.action === APPROVAL_ACTIONS.USER_DELETE) {
      const user = await User.findByPk(payload.userId);
      if (user) await user.destroy();
    }

    // Mark request as approved
    await request.update({
      status:         'approved',
      checkerId:      req.session.userId,
      checkerComment: checkerComment || null,
    });

    req.session.flash = { type: 'success', message: `Request approved and action executed successfully.` };
    res.redirect('/approvals');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to approve request.' };
    res.redirect('/approvals');
  }
};

// POST /approvals/:id/reject
exports.reject = async (req, res) => {
  try {
    const request = await ApprovalRequest.findByPk(req.params.id);

    if (!request || request.status !== 'pending') {
      req.session.flash = { type: 'error', message: 'Request not found or already processed.' };
      return res.redirect('/approvals');
    }

    const { checkerComment } = req.body;

    await request.update({
      status:         'rejected',
      checkerId:      req.session.userId,
      checkerComment: checkerComment || null,
    });

    req.session.flash = { type: 'success', message: 'Request rejected.' };
    res.redirect('/approvals');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to reject request.' };
    res.redirect('/approvals');
  }
};

// GET /my-requests  (maker's own request history)
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await ApprovalRequest.findAll({
      where: { makerId: req.session.userId },
      include: [
        { model: User, as: 'checker', attributes: ['id', 'name'] },
        { model: Blog, as: 'blog', attributes: ['id', 'title'], required: false },
      ],
      order: [['createdAt', 'DESC']],
    });

    const counts = {
      pending:  requests.filter(r => r.status === 'pending').length,
      approved: requests.filter(r => r.status === 'approved').length,
      rejected: requests.filter(r => r.status === 'rejected').length,
    };

    res.render('approvals/my-requests', {
      title: 'My Requests',
      requests,
      counts,
      APPROVAL_ACTIONS,
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load your requests.' };
    res.redirect('/dashboard');
  }
};

// Export helper for use in other controllers
exports.needsApproval = needsApproval;
exports.createRequest  = createRequest;
