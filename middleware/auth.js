const { PERMISSIONS } = require('../config/permissions');

const getUser = () => require('../models/User');
const getChangeRequest = () => require('../models/ChangeRequest');

/**
 * Syncs session from DB on every authenticated request.
 * Returns { user, reason } where:
 *   - user is the fresh DB record if the session is valid
 *   - reason is a string code only when the session must be killed
 *
 * Permission / role changes do NOT kill the session — they are silently
 * applied to req.session so the user picks them up on their very next
 * request without any interruption.
 *
 * Only hard account status changes (suspended, rejected, deleted) force logout.
 */
const syncUserFromDB = async (req) => {
  if (!req.session || !req.session.userId) {
    return { user: null, reason: 'not_logged_in' };
  }

  try {
    const User = getUser();
    const user = await User.findByPk(req.session.userId, {
      attributes: ['id', 'name', 'email', 'role', 'status', 'permissions']
    });

    // Hard account status checks — these force logout with a clear message
    if (!user)                       return { user: null, reason: 'account_deleted' };
    if (user.status === 'suspended') return { user: null, reason: 'account_suspended' };
    if (user.status === 'rejected')  return { user: null, reason: 'account_rejected' };
    if (user.status !== 'approved')  return { user: null, reason: 'session_expired' };

    // Silently sync latest role + permissions into session.
    // If admin changed them, the user simply gets the new values
    // applied on this request — no logout, no disruption.
    req.session.userId      = user.id;
    req.session.userName    = user.name;
    req.session.userEmail   = user.email;
    req.session.userRole    = user.role;
    req.session.permissions = user.permissions || [];

    return { user, reason: null };
  } catch (err) {
    console.error('syncUserFromDB error:', err.message);
    return { user: null, reason: 'session_expired' };
  }
};

// ── isAuthenticated ──────────────────────────────────────────────────────────
const isAuthenticated = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.session.flash = { type: 'error', message: 'Please login to continue.' };
    return res.redirect('/auth/login');
  }

  const { user, reason } = await syncUserFromDB(req);

  if (!user) {
    return req.session.destroy(() => {
      res.redirect(`/auth/login?reason=${reason || 'session_expired'}`);
    });
  }

  return next();
};

// ── isGuest ──────────────────────────────────────────────────────────────────
const isGuest = (req, res, next) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  return next();
};

// ── hasPermission ────────────────────────────────────────────────────────────
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      req.session.flash = { type: 'error', message: 'Please login to continue.' };
      return res.redirect('/auth/login');
    }
    const userPermissions = req.session.permissions || [];
    if (userPermissions.includes(permission)) return next();
    req.session.flash = {
      type: 'error',
      message: 'Access denied. You do not have permission to perform this action.'
    };
    return res.redirect('/dashboard');
  };
};

// ── hasAnyPermission ─────────────────────────────────────────────────────────
const hasAnyPermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      req.session.flash = { type: 'error', message: 'Please login to continue.' };
      return res.redirect('/auth/login');
    }
    const userPermissions = req.session.permissions || [];
    if (permissions.some(p => userPermissions.includes(p))) return next();
    req.session.flash = {
      type: 'error',
      message: 'Access denied. You do not have permission to perform this action.'
    };
    return res.redirect('/dashboard');
  };
};

// ── attachUser ───────────────────────────────────────────────────────────────
// Populates res.locals.currentUser and res.locals.can() for every EJS view.
// Must run after isAuthenticated so the session is already synced from DB.
const attachUser = async (req, res, next) => {
  if (req.session && req.session.userId) {
    const perms = req.session.permissions || [];
    res.locals.currentUser = {
      id:          req.session.userId,
      name:        req.session.userName,
      email:       req.session.userEmail,
      role:        req.session.userRole,
      permissions: perms
    };
    res.locals.can = (permission) => (req.session.permissions || []).includes(permission);

    // Small count for the "Pending Approvals" nav badge — only queried for checkers.
    res.locals.pendingApprovalCount = 0;
    if (perms.includes('approve_change') || perms.includes('reject_change')) {
      try {
        const ChangeRequest = getChangeRequest();
        res.locals.pendingApprovalCount = await ChangeRequest.count({ where: { status: 'pending' } });
      } catch (err) {
        console.error('pendingApprovalCount error:', err.message);
      }
    }
  } else {
    res.locals.currentUser = null;
    res.locals.can = () => false;
  }

  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  next();
};

module.exports = { isAuthenticated, isGuest, hasPermission, hasAnyPermission, attachUser };
