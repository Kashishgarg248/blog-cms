const { ChangeRequest, Blog, User } = require('../models');
const { PERMISSIONS, ROLE_PERMISSIONS, ROLE_RANK } = require('../config/permissions');

class ChangeRequestError extends Error {}

// Fields that are actually allowed to travel through a Blog change request.
const BLOG_FIELDS = ['title', 'content', 'status', 'authorId', 'tags', 'publishedAt', 'excerpt', 'coverImage'];
// Fields allowed through a User change request.
const USER_FIELDS = ['status', 'role', 'permissions'];

function pick(obj, fields) {
  const out = {};
  fields.forEach(f => { if (obj[f] !== undefined) out[f] = obj[f]; });
  return out;
}

function summarize(entityType, action, payload, previousData) {
  if (entityType === 'Blog') {
    const title = (payload && payload.title) || (previousData && previousData.title) || 'Untitled blog';
    return `${action} blog: "${title}"`;
  }
  if (entityType === 'User') {
    const label = (previousData && previousData.email) || (payload && payload.email) || `user #`;
    return `${action} user: ${label}`;
  }
  return `${action} ${entityType}`;
}

/**
 * Is there already an unresolved pending request for this exact record?
 * We only allow ONE pending change per record at a time to avoid
 * conflicting/overlapping approvals.
 */
async function hasPendingRequest(entityType, entityId) {
  if (!entityId) return false;
  const existing = await ChangeRequest.findOne({
    where: { entityType, entityId, status: 'pending' }
  });
  return !!existing;
}

/**
 * Submit a new change request. Nothing is written to Blog/User here —
 * only the ChangeRequest row is created. This is what every "maker" action
 * (create/update/delete) now funnels through.
 */
async function submit({ entityType, entityId, action, payload, previousData, requestedBy }) {
  if (action !== 'create' && await hasPendingRequest(entityType, entityId)) {
    throw new ChangeRequestError(
      'This record already has a pending change request awaiting review. ' +
      'Please wait for it to be approved or rejected before submitting another.'
    );
  }

  const cleanPayload = entityType === 'Blog' ? pick(payload || {}, BLOG_FIELDS) : pick(payload || {}, USER_FIELDS);

  const cr = await ChangeRequest.create({
    entityType,
    entityId: entityId || null,
    action,
    payload: action === 'delete' ? null : cleanPayload,
    previousData: previousData || null,
    status: 'pending',
    requestedBy,
    summary: summarize(entityType, action, cleanPayload, previousData)
  });

  return cr;
}

/**
 * Can this reviewer act (approve or reject) on this change request?
 * Enforces the two hard maker-checker rules:
 *   1. Segregation of duty — you cannot review your own submission, ever,
 *      no matter which permissions you hold.
 *   2. You must actually hold the relevant checker permission.
 */
function assertCanReview(changeRequest, reviewer, requiredPermission) {
  if (changeRequest.status !== 'pending') {
    throw new ChangeRequestError('This change request has already been reviewed.');
  }
  const reviewerPerms = reviewer.permissions || [];
  if (!reviewerPerms.includes(requiredPermission)) {
    throw new ChangeRequestError('You do not have permission to review change requests.');
  }
  if (changeRequest.requestedBy === reviewer.id) {
    throw new ChangeRequestError(
      'Segregation of duty: you cannot approve or reject your own submitted change. ' +
      'Another checker must review it.'
    );
  }
}

/**
 * Approve a pending change request — this is the ONLY place that actually
 * mutates Blog/User rows for create/update/delete actions.
 */
async function approve(changeRequestId, reviewer, note) {
  const cr = await ChangeRequest.findByPk(changeRequestId);
  if (!cr) throw new ChangeRequestError('Change request not found.');

  assertCanReview(cr, reviewer, PERMISSIONS.APPROVE_CHANGE);

  const Model = cr.entityType === 'Blog' ? Blog : User;

  if (cr.action === 'create') {
    await Model.create(cr.payload);
  } else if (cr.action === 'update') {
    const record = await Model.findByPk(cr.entityId);
    if (!record) throw new ChangeRequestError('The record this change applies to no longer exists.');
    await record.update(cr.payload);
  } else if (cr.action === 'delete') {
    const record = await Model.findByPk(cr.entityId);
    if (record) await record.destroy();
  }

  cr.status = 'approved';
  cr.reviewedBy = reviewer.id;
  cr.reviewNote = note || null;
  cr.reviewedAt = new Date();
  await cr.save();

  return cr;
}

/**
 * Reject a pending change request. No changes are ever applied.
 */
async function reject(changeRequestId, reviewer, note) {
  const cr = await ChangeRequest.findByPk(changeRequestId);
  if (!cr) throw new ChangeRequestError('Change request not found.');

  assertCanReview(cr, reviewer, PERMISSIONS.REJECT_CHANGE);

  if (!note || !note.trim()) {
    throw new ChangeRequestError('A reason is required when rejecting a change request.');
  }

  cr.status = 'rejected';
  cr.reviewedBy = reviewer.id;
  cr.reviewNote = note.trim();
  cr.reviewedAt = new Date();
  await cr.save();

  return cr;
}

module.exports = {
  ChangeRequestError,
  submit,
  approve,
  reject,
  hasPendingRequest,
  BLOG_FIELDS,
  USER_FIELDS
};
