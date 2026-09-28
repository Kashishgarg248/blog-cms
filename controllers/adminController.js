const { User, Blog, ChangeRequest } = require('../models');
const { ROLE_PERMISSIONS, PERMISSIONS, ROLES, ROLE_RANK } = require('../config/permissions');
const changeRequestService = require('../services/changeRequestService');

/**
 * Determine what the current editor (req.session) is allowed to do to a target user.
 * Returns an object the controller and view can both use.
 *
 * Rules:
 *  - Nobody can edit themselves
 *  - Nobody can edit a user whose rank >= their own rank
 *    (admin cannot touch another admin or a super_admin)
 *  - Only super_admin can assign the admin or super_admin role
 *  - An editor can only grant permissions they themselves hold
 */
function resolveEditCapability(editorSession, targetUser) {
  const editorRole = editorSession.userRole;
  const editorRank = ROLE_RANK[editorRole] || 0;
  const editorPerms = editorSession.permissions || [];
  const targetRank  = ROLE_RANK[targetUser.role] || 0;
  const isSelf      = editorSession.userId === targetUser.id;

  // Absolute blocks
  if (isSelf)              return { canEdit: false, reason: 'You cannot edit your own account.' };
  if (targetRank >= editorRank) return { canEdit: false, reason: `You cannot modify a user with the same or higher role (${targetUser.role}).` };

  // Roles the editor is allowed to assign
  const assignableRoles = Object.keys(ROLE_RANK).filter(r => {
    if (r === 'super_admin') return editorRole === 'super_admin';
    if (r === 'admin')       return editorRole === 'super_admin';
    return ROLE_RANK[r] < editorRank; // can only assign roles below your own
  });

  // Permissions the editor is allowed to grant (only their own set)
  const grantablePerms = Object.values(PERMISSIONS).filter(p => editorPerms.includes(p));

  return { canEdit: true, assignableRoles, grantablePerms };
}

// GET /admin/users
exports.getUsers = async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const where = {};
    if (['pending','approved','rejected','suspended'].includes(filter)) where.status = filter;

    const users = await User.findAll({
      where,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password'] }
    });

    const counts = {
      all:      await User.count(),
      pending:  await User.count({ where: { status: 'pending' } }),
      approved: await User.count({ where: { status: 'approved' } }),
      rejected: await User.count({ where: { status: 'rejected' } }),
    };

    const userIds = users.map(u => u.id);
    let pendingChangeUserIds = new Set();
    if (userIds.length) {
      const pending = await ChangeRequest.findAll({
        where: { entityType: 'User', entityId: userIds, status: 'pending' },
        attributes: ['entityId']
      });
      pendingChangeUserIds = new Set(pending.map(p => p.entityId));
    }

    res.render('admin/users', { title: 'User Management', users, filter, counts, PERMISSIONS, ROLE_RANK, pendingChangeUserIds });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load users.' };
    res.redirect('/dashboard');
  }
};

// GET /admin/users/:id
exports.getUserDetail = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Blog, as: 'blogs', limit: 5, order: [['createdAt', 'DESC']] }]
    });

    if (!user) {
      req.session.flash = { type: 'error', message: 'User not found.' };
      return res.redirect('/admin/users');
    }

    const capability = resolveEditCapability(req.session, user);

    const pendingChange = await ChangeRequest.findOne({
      where: { entityType: 'User', entityId: user.id, status: 'pending' },
      include: [{ model: User, as: 'requester', attributes: ['id', 'name'] }]
    });

    const userPerms = req.session.permissions || [];
    const canReview = userPerms.includes(PERMISSIONS.APPROVE_CHANGE) || userPerms.includes(PERMISSIONS.REJECT_CHANGE);

    res.render('admin/user-detail', {
      title: `User: ${user.name}`,
      user,
      capability,           // { canEdit, reason?, assignableRoles?, grantablePerms? }
      PERMISSIONS,
      ROLES,
      ROLE_RANK,
      ROLE_PERMISSIONS,
      allPermissions: Object.values(PERMISSIONS),
      pendingChange,
      canReview
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load user.' };
    res.redirect('/admin/users');
  }
};

// POST /admin/users/:id
// Nothing is written to the User row here — role/status/permission changes
// (even made by a super admin) are queued as a ChangeRequest and only take
// effect once a checker approves them.
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      req.session.flash = { type: 'error', message: 'User not found.' };
      return res.redirect('/admin/users');
    }

    // Re-run capability check server-side (never trust the client)
    const capability = resolveEditCapability(req.session, user);
    if (!capability.canEdit) {
      req.session.flash = { type: 'error', message: capability.reason };
      return res.redirect('/admin/users');
    }

    if (await changeRequestService.hasPendingRequest('User', user.id)) {
      req.session.flash = {
        type: 'warning',
        message: `${user.name} already has a change request awaiting review. Wait for it to be resolved before submitting another.`
      };
      return res.redirect(`/admin/users/${user.id}`);
    }

    const { status, role, permissions } = req.body;

    // Validate requested role is in the editor's assignable set
    const requestedRole = role || user.role;
    if (!capability.assignableRoles.includes(requestedRole)) {
      req.session.flash = { type: 'error', message: `You are not allowed to assign the "${requestedRole}" role.` };
      return res.redirect(`/admin/users/${user.id}`);
    }

    // Build permissions — start from role defaults, then filter by what editor can grant
    let basePerms = (requestedRole !== 'custom') ? (ROLE_PERMISSIONS[requestedRole] || []) : [];
    const extraPerms = permissions
      ? (Array.isArray(permissions) ? permissions : [permissions])
      : [];

    // Merge and strip any permission the editor doesn't hold themselves
    const finalPerms = [...new Set([...basePerms, ...extraPerms])]
      .filter(p => capability.grantablePerms.includes(p));

    // Validate status
    const allowedStatuses = ['pending', 'approved', 'rejected', 'suspended'];
    const finalStatus = allowedStatuses.includes(status) ? status : user.status;

    await changeRequestService.submit({
      entityType: 'User',
      entityId: user.id,
      action: 'update',
      payload: { status: finalStatus, role: requestedRole, permissions: finalPerms },
      previousData: { status: user.status, role: user.role, permissions: user.permissions, email: user.email },
      requestedBy: req.session.userId
    });

    req.session.flash = {
      type: 'success',
      message: `Change to ${user.name}'s account submitted for approval.`
    };
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to update user.' };
    res.redirect('/admin/users');
  }
};

// DELETE /admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      req.session.flash = { type: 'error', message: 'User not found.' };
      return res.redirect('/admin/users');
    }

    const capability = resolveEditCapability(req.session, user);
    if (!capability.canEdit) {
      req.session.flash = { type: 'error', message: capability.reason };
      return res.redirect('/admin/users');
    }

    if (user.role === 'super_admin') {
      req.session.flash = { type: 'error', message: 'Cannot delete a Super Admin account.' };
      return res.redirect('/admin/users');
    }

    if (await changeRequestService.hasPendingRequest('User', user.id)) {
      req.session.flash = {
        type: 'warning',
        message: `${user.name} already has a change request awaiting review.`
      };
      return res.redirect('/admin/users');
    }

    await changeRequestService.submit({
      entityType: 'User',
      entityId: user.id,
      action: 'delete',
      payload: null,
      previousData: { email: user.email, role: user.role, status: user.status },
      requestedBy: req.session.userId
    });

    req.session.flash = { type: 'success', message: `Delete request for ${user.name} submitted for approval.` };
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to submit delete request.' };
    res.redirect('/admin/users');
  }
};

// GET /admin/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const [totalUsers, pendingUsers, totalBlogs, publishedBlogs, draftBlogs, recentUsers, recentBlogs] = await Promise.all([
      User.count(),
      User.count({ where: { status: 'pending' } }),
      Blog.count(),
      Blog.count({ where: { status: 'published' } }),
      Blog.count({ where: { status: 'draft' } }),
      User.findAll({ limit: 5, order: [['createdAt', 'DESC']], attributes: { exclude: ['password'] } }),
      Blog.findAll({ limit: 5, order: [['createdAt', 'DESC']], include: [{ model: User, as: 'author', attributes: ['name', 'status'] }] })
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { totalUsers, pendingUsers, totalBlogs, publishedBlogs, draftBlogs },
      recentUsers,
      recentBlogs
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load dashboard.' };
    res.redirect('/dashboard');
  }
};
