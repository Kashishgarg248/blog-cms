const { User } = require('../models');
const { ROLE_PERMISSIONS } = require('../config/permissions');

// Reason-code → human message map for query-param driven notices
const REASON_MESSAGES = {
  session_expired:   { type: 'warning', message: 'Your session has expired. Please log in again.' },
  account_suspended: { type: 'error',   message: 'Your account has been suspended. Please contact an admin.' },
  account_rejected:  { type: 'error',   message: 'Your account request was rejected.' },
  account_deleted:   { type: 'error',   message: 'Your account no longer exists. Please contact an admin.' },
};

// GET /auth/login
exports.getLogin = (req, res) => {
  const formData = req.session.formData || {};
  delete req.session.formData;

  // If a reason query param exists, inject the notice directly into res.locals
  // so it shows even though attachUser already ran and cleared req.session.flash
  const reasonKey = req.query.reason;
  if (reasonKey && REASON_MESSAGES[reasonKey]) {
    // Override whatever attachUser set (which was null) with the real message
    res.locals.flash = REASON_MESSAGES[reasonKey];
  }

  res.render('auth/login', { title: 'Login', formData });
};

// POST /auth/login
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user || !(await user.validatePassword(password))) {
      req.session.flash = { type: 'error', message: 'Invalid email or password.' };
      return res.redirect('/auth/login');
    }

    if (user.status === 'pending') {
      req.session.flash = { type: 'warning', message: 'Your account is pending admin approval.' };
      return res.redirect('/auth/login');
    }

    if (user.status === 'rejected') {
      req.session.flash = { type: 'error', message: 'Your account request was rejected.' };
      return res.redirect('/auth/login');
    }

    if (user.status === 'suspended') {
      req.session.flash = { type: 'error', message: 'Your account has been suspended. Contact an admin.' };
      return res.redirect('/auth/login');
    }

    // Set session
    req.session.userId      = user.id;
    req.session.userName    = user.name;
    req.session.userEmail   = user.email;
    req.session.userRole    = user.role;
    req.session.permissions = user.permissions || [];

    req.session.flash = { type: 'success', message: `Welcome back, ${user.name}!` };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Login failed. Please try again.' };
    res.redirect('/auth/login');
  }
};

// GET /auth/register
exports.getRegister = (req, res) => {
  const formData = req.session.formData || {};
  delete req.session.formData;
  res.render('auth/register', { title: 'Register', formData });
};

// POST /auth/register
exports.postRegister = async (req, res) => {
  try {
    const { name, email, password, bio } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      req.session.flash = { type: 'error', message: 'Email is already registered.' };
      req.session.formData = req.body;
      return res.redirect('/auth/register');
    }

    await User.create({
      name,
      email,
      password,
      bio: bio || null,
      status: 'pending',
      role: 'reader',
      permissions: []
    });

    req.session.flash = {
      type: 'success',
      message: 'Registration successful! Your account is pending admin approval — you will be notified once approved.'
    };
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Registration failed. Please try again.' };
    req.session.formData = req.body;
    res.redirect('/auth/register');
  }
};

// POST /auth/logout
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/auth/login');
  });
};
