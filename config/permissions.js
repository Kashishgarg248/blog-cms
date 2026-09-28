const PERMISSIONS = {
  CREATE_BLOG:    'create_blog',
  READ_BLOG:      'read_blog',
  UPDATE_BLOG:    'update_blog',
  DELETE_BLOG:    'delete_blog',
  PUBLISH_BLOG:   'publish_blog',
  VIEW_USERS:     'view_users',
  APPROVE_USER:   'approve_user',
  ASSIGN_ROLE:    'assign_role',
  DELETE_USER:    'delete_user',
  MANAGE_ROLES:   'manage_roles',
  VIEW_ALL_BLOGS: 'view_all_blogs',

  // ── Maker-Checker (change approval) ─────────────────────────────────────
  // These two are the "Checker" permissions. Anyone holding them can act as
  // an approver/rejecter for pending change requests raised against Blogs
  // or Users. They are NOT granted by default to admin/writer — they must be
  // deliberately assigned (e.g. to a CEO account) via /admin/users.
  APPROVE_CHANGE: 'approve_change',
  REJECT_CHANGE:  'reject_change',
};

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN:       'admin',
  WRITER:      'writer',
  READER:      'reader',
};

// Numeric rank — higher = more powerful. Used for "can X edit Y?" checks.
const ROLE_RANK = {
  super_admin: 100,
  admin:        50,
  writer:       20,
  reader:       10,
  custom:       Object.keys(PERMISSIONS).length * 5,
};

const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ADMIN]: [
    PERMISSIONS.CREATE_BLOG,
    PERMISSIONS.READ_BLOG,
    PERMISSIONS.UPDATE_BLOG,
    PERMISSIONS.DELETE_BLOG,
    PERMISSIONS.PUBLISH_BLOG,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.APPROVE_USER,
    PERMISSIONS.ASSIGN_ROLE,
    PERMISSIONS.VIEW_ALL_BLOGS,
  ],
  [ROLES.WRITER]: [
    PERMISSIONS.CREATE_BLOG,
    PERMISSIONS.READ_BLOG,
    PERMISSIONS.UPDATE_BLOG,
    PERMISSIONS.DELETE_BLOG,
    PERMISSIONS.PUBLISH_BLOG,
  ],
  [ROLES.READER]: [
    PERMISSIONS.READ_BLOG,
  ],
};

module.exports = { PERMISSIONS, ROLES, ROLE_RANK, ROLE_PERMISSIONS };
