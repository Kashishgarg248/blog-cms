# BlogCMS — Role-Based Blog Management System

A full-stack Blog Management System built with **Node.js, Express.js, PostgreSQL, Sequelize ORM, and EJS**, featuring fine-grained Role-Based Access Control (RBAC).

---

## ⚡ Tech Stack

| Layer       | Technology                                    |
|-------------|-----------------------------------------------|
| Runtime     | Node.js                                       |
| Framework   | Express.js (MVC architecture)                 |
| Database    | PostgreSQL                                    |
| ORM         | Sequelize                                     |
| Views       | EJS + express-ejs-layouts                     |
| Auth        | express-session + connect-session-sequelize   |
| Passwords   | bcryptjs (12 salt rounds)                     |
| Validation  | express-validator (backend) + JS (frontend)   |
| HTTP        | method-override (PUT/DELETE via forms)        |

---

## 📁 Project Structure (MVC)

```
blog-cms/
├── app.js                    # Entry point — Express setup, DB sync, seeding
├── .env.example              # Environment variable template
├── config/
│   ├── database.js           # Sequelize connection
│   └── permissions.js        # PERMISSIONS, ROLES, ROLE_PERMISSIONS constants
├── models/
│   ├── index.js              # Associations
│   ├── User.js               # User model (hooks: bcrypt hash)
│   └── Blog.js               # Blog model (hooks: auto-slug, auto-excerpt)
├── controllers/
│   ├── authController.js     # Login, Register, Logout
│   ├── blogController.js     # CRUD for blogs
│   ├── adminController.js    # User management, Admin dashboard
│   └── dashboardController.js# User dashboard stats
├── middleware/
│   ├── auth.js               # isAuthenticated, isGuest, hasPermission, attachUser
│   └── validation.js         # express-validator rules per route
├── routes/
│   ├── auth.js               # /auth/*
│   ├── blogs.js              # /blogs/*
│   ├── admin.js              # /admin/*
│   └── dashboard.js          # /dashboard
├── views/
│   ├── layouts/main.ejs      # Shell layout with sidebar + topbar
│   ├── auth/login.ejs
│   ├── auth/register.ejs
│   ├── dashboard.ejs
│   ├── blogs/{index,show,create,edit}.ejs
│   ├── admin/{dashboard,users,user-detail}.ejs
│   ├── 404.ejs
│   └── error.ejs
└── public/
    ├── css/style.css
    └── js/app.js
```

---

## 🔐 RBAC — Roles & Permissions

### Roles
| Role        | Description                                       |
|-------------|---------------------------------------------------|
| super_admin | Full access to everything, cannot be deleted      |
| admin       | User management + all blog operations             |
| writer      | Create/Read/Update/Delete/Publish own blogs       |
| reader      | Read published blogs only                         |
| custom      | Admin-defined mix of individual permissions       |

### Permissions
| Permission     | Description                            |
|----------------|----------------------------------------|
| create_blog    | Create new blog posts                  |
| read_blog      | View blog posts                        |
| update_blog    | Edit blog posts                        |
| delete_blog    | Delete blog posts                      |
| publish_blog   | Set blogs to "published" status        |
| view_users     | See user list                          |
| approve_user   | Approve/reject/suspend users           |
| assign_role    | Assign roles to users                  |
| delete_user    | Permanently delete users               |
| manage_roles   | Full role management (super_admin only)|
| view_all_blogs | See all blogs regardless of ownership  |

---

## 🚀 Setup & Installation

### 1. Prerequisites
- Node.js ≥ 18
- PostgreSQL running locally

### 2. Clone & Install
```bash
git clone <repo>
cd blog-cms
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials
```

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=blog_cms
DB_USER=postgres
DB_PASSWORD=yourpassword
SESSION_SECRET=change_this_to_a_long_random_string
SUPER_ADMIN_EMAIL=superadmin@blog.com
SUPER_ADMIN_PASSWORD=SuperAdmin@123
```

### 4. Create Database
```sql
-- In psql or pgAdmin:
CREATE DATABASE blog_cms;
```

### 5. Run
```bash
npm start
# or for development with auto-reload:
npx nodemon app.js
```

The app auto-syncs models and seeds the Super Admin on first run.

### 6. Login
```
URL:      http://localhost:3000
Email:    superadmin@blog.com
Password: SuperAdmin@123
```

---

## 🔄 Workflow

```
1. Super Admin exists in DB (auto-seeded on startup)
2. User visits /auth/register → fills form → account status = "pending"
3. Super Admin / Admin logs in → goes to Admin Panel → User Management
4. Admin opens the user → sets Status = "Approved", assigns Role + Permissions → Save
5. User can now log in
6. User sees only buttons/actions their permissions allow (sidebar + page buttons)
7. Backend double-checks every request via hasPermission() middleware
```

---

## 🛡 Security Features

- **Passwords** hashed with bcrypt (12 rounds) via Sequelize `beforeCreate`/`beforeUpdate` hooks
- **Sessions** stored in PostgreSQL (not in-memory), expire after 24h
- **Backend validation** on every form submit via `express-validator`
- **Frontend validation** with live feedback before form submission
- **Permission checks** on every protected route (middleware layer)
- **Method override** for proper REST (PUT/DELETE via POST forms)
- **Super Admin protection** — cannot be deleted or modified by non-super-admins
- **Ownership checks** — writers can only edit/delete their own blogs

---

## 📸 Pages

| Route                  | Access              | Description                  |
|------------------------|---------------------|------------------------------|
| `/auth/login`          | Guest only          | Login form                   |
| `/auth/register`       | Guest only          | Registration (→ pending)     |
| `/dashboard`           | Authenticated       | Personal stats + quick links |
| `/blogs`               | `read_blog`         | Paginated blog list + search |
| `/blogs/create`        | `create_blog`       | New blog form                |
| `/blogs/:id`           | `read_blog`         | Blog detail view             |
| `/blogs/:id/edit`      | `update_blog`       | Edit blog form               |
| `/admin/dashboard`     | `view_users`        | System stats                 |
| `/admin/users`         | `view_users`        | User list with filters       |
| `/admin/users/:id`     | `approve_user`      | Manage individual user       |
