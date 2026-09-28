const { Blog, User } = require('../models');
const { PERMISSIONS } = require('../config/permissions');

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userPerms = req.session.permissions || [];
    const canViewAll = userPerms.includes(PERMISSIONS.VIEW_ALL_BLOGS);

    const myBlogsCount = await Blog.count({ where: { authorId: userId } });
    const myPublishedCount = await Blog.count({ where: { authorId: userId, status: 'published' } });
    const myDraftCount = await Blog.count({ where: { authorId: userId, status: 'draft' } });

    const myRecentBlogs = await Blog.findAll({
      where: { authorId: userId },
      limit: 5,
      order: [['createdAt', 'DESC']]
    });

    let allStats = null;
    if (canViewAll) {
      allStats = {
        totalBlogs: await Blog.count(),
        publishedBlogs: await Blog.count({ where: { status: 'published' } }),
        pendingUsers: await User.count({ where: { status: 'pending' } })
      };
    }

    res.render('dashboard', {
      title: 'My Dashboard',
      myBlogsCount,
      myPublishedCount,
      myDraftCount,
      myRecentBlogs,
      allStats
    });
  } catch (err) {
    console.error(err);
    res.render('dashboard', {
      title: 'Dashboard',
      myBlogsCount: 0,
      myPublishedCount: 0,
      myDraftCount: 0,
      myRecentBlogs: [],
      allStats: null
    });
  }
};
