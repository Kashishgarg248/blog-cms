const { ChangeRequest, User } = require('../models');
const { PERMISSIONS } = require('../config/permissions');
const changeRequestService = require('../services/changeRequestService');

// GET /change-requests  (the checker's queue)
exports.index = async (req, res) => {
  try {
    const filter = req.query.filter || 'pending';
    const where = ['pending', 'approved', 'rejected'].includes(filter) ? { status: filter } : {};

    const requests = await ChangeRequest.findAll({
      where,
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reviewer', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const counts = {
      pending:  await ChangeRequest.count({ where: { status: 'pending' } }),
      approved: await ChangeRequest.count({ where: { status: 'approved' } }),
      rejected: await ChangeRequest.count({ where: { status: 'rejected' } })
    };

    res.render('change-requests/index', {
      title: 'Pending Approvals',
      requests,
      filter,
      counts,
      currentUserId: req.session.userId
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load change requests.' };
    res.redirect('/dashboard');
  }
};

// GET /change-requests/mine  (a maker's own submissions)
exports.mine = async (req, res) => {
  try {
    const requests = await ChangeRequest.findAll({
      where: { requestedBy: req.session.userId },
      include: [{ model: User, as: 'reviewer', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });
    res.render('change-requests/mine', { title: 'My Submitted Changes', requests });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load your change requests.' };
    res.redirect('/dashboard');
  }
};

// GET /change-requests/:id
exports.show = async (req, res) => {
  try {
    const cr = await ChangeRequest.findByPk(req.params.id, {
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reviewer', attributes: ['id', 'name'] }
      ]
    });

    if (!cr) {
      req.session.flash = { type: 'error', message: 'Change request not found.' };
      return res.redirect('/change-requests');
    }

    const userPerms = req.session.permissions || [];
    const isRequester = cr.requestedBy === req.session.userId;
    const canReview = userPerms.includes(PERMISSIONS.APPROVE_CHANGE) || userPerms.includes(PERMISSIONS.REJECT_CHANGE);

    if (!isRequester && !canReview) {
      req.session.flash = { type: 'error', message: 'You do not have access to this change request.' };
      return res.redirect('/dashboard');
    }

    const canApprove = userPerms.includes(PERMISSIONS.APPROVE_CHANGE) && cr.requestedBy !== req.session.userId;
    const canReject  = userPerms.includes(PERMISSIONS.REJECT_CHANGE)  && cr.requestedBy !== req.session.userId;
    const blockedBySelf = isRequester && (userPerms.includes(PERMISSIONS.APPROVE_CHANGE) || userPerms.includes(PERMISSIONS.REJECT_CHANGE));

    res.render('change-requests/show', { title: 'Review Change', cr, canApprove, canReject, blockedBySelf, isRequester });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load change request.' };
    res.redirect('/change-requests');
  }
};

// POST /change-requests/:id/approve
exports.approve = async (req, res) => {
  try {
    const reviewer = { id: req.session.userId, permissions: req.session.permissions || [] };
    await changeRequestService.approve(req.params.id, reviewer, req.body.note);
    req.session.flash = { type: 'success', message: 'Change approved and applied.' };
    res.redirect('/change-requests');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to approve change request.' };
    res.redirect(`/change-requests/${req.params.id}`);
  }
};

// POST /change-requests/:id/reject
exports.reject = async (req, res) => {
  try {
    const reviewer = { id: req.session.userId, permissions: req.session.permissions || [] };
    await changeRequestService.reject(req.params.id, reviewer, req.body.note);
    req.session.flash = { type: 'success', message: 'Change rejected.' };
    res.redirect('/change-requests');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to reject change request.' };
    res.redirect(`/change-requests/${req.params.id}`);
  }
};
