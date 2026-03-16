/**
 * Auth middleware - protects API routes
 * Skips auth check if NODE_ENV=development and no session exists
 * (allows testing without logging in)
 */

export function requireAuth(req, res, next) {
  if (req.session?.user) {
    req.user = req.session.user;
    return next();
  }

  // Dev mode: allow through with a guest user
  if (process.env.NODE_ENV === "development") {
    req.user = { id: "dev", name: "Dev User", email: "dev@local", role: "admin" };
    return next();
  }

  res.status(401).json({ error: "Not authenticated" });
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role === "admin" || process.env.NODE_ENV === "development") {
      return next();
    }
    res.status(403).json({ error: "Admin access required" });
  });
}
