require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const path = require('path');
const bcryptjs = require('bcryptjs');

const { sequelize, User } = require('./models');
const { ROLE_PERMISSIONS, ROLES, PERMISSIONS } = require('./config/permissions');
const { attachUser } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const blogRoutes = require('./routes/blogs');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const changeRequestRoutes = require('./routes/changeRequests');

const app = express();

// ─── Session Store ───
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'sessions',
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 24 * 60 * 60 * 1000
});

// ─── Middleware ───
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'blog_cms_secret_key_change_in_production',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true }
}));

// ─── View Engine ───
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ─── Attach user to all requests ───
app.use(attachUser);

// ─── Routes ───
app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.redirect('/auth/login');
});

app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/blogs', blogRoutes);
app.use('/admin', adminRoutes);
app.use('/change-requests', changeRequestRoutes);

// ─── 404 Handler ───
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Not Found' });
});

// ─── Error Handler ───
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Server Error', error: err.message });
});

// ─── DB Sync & Seed Super Admin ───
async function initializeApp() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    await sequelize.sync({ alter: true });
    console.log('✅ Models synchronized');

    sessionStore.sync();

    // Seed Super Admin if not exists
    const existing = await User.findOne({ where: { role: 'super_admin' } });
    if (!existing) {
      await User.create({
        name: 'Super Admin',
        email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@blog.com',
        password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123',
        role: ROLES.SUPER_ADMIN,
        status: 'approved',
        permissions: ROLE_PERMISSIONS[ROLES.SUPER_ADMIN]
      });
      console.log('✅ Super Admin seeded');
      console.log('   Email:    superadmin@blog.com');
      console.log('   Password: SuperAdmin@123');
    }

    // Seed an initial Checker (e.g. CEO) if credentials are provided.
    // This is a one-time bootstrap step done directly against the DB, not
    // through the app's own CRUD layer — because strict self-approval means
    // the Super Admin alone can never approve their own first actions.
    // Set CEO_EMAIL / CEO_PASSWORD / CEO_NAME in .env to enable this.
    if (process.env.CEO_EMAIL && process.env.CEO_PASSWORD) {
      const existingCeo = await User.findOne({ where: { email: process.env.CEO_EMAIL } });
      if (!existingCeo) {
        await User.create({
          name: process.env.CEO_NAME || 'CEO',
          email: process.env.CEO_EMAIL,
          password: process.env.CEO_PASSWORD,
          role: 'custom',
          status: 'approved',
          permissions: [
            ...ROLE_PERMISSIONS[ROLES.WRITER], // create/read/update/delete/publish blog
            PERMISSIONS.APPROVE_CHANGE,
            PERMISSIONS.REJECT_CHANGE
          ]
        });
        console.log('✅ Checker (CEO) account seeded');
        console.log(`   Email: ${process.env.CEO_EMAIL}`);
      }
    } else {
      console.log('ℹ️  No CEO_EMAIL/CEO_PASSWORD set — skipping checker bootstrap.');
      console.log('   Until a second account holds approve_change/reject_change,');
      console.log('   the Super Admin\'s own changes cannot be approved (self-approval is blocked).');
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Startup error:', err.message);
    process.exit(1);
  }
}

initializeApp();
