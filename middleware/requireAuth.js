/**
 * Auth middleware - protects API routes
 * Requires an authenticated local user for every protected route.
 */

export function requireAuth(req, res, next) {
  if (req.session?.user) {
    req.user = req.session.user;
    return next();
  }

  res.status(401).json({ error: "Not authenticated" });
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role === "admin") {
      return next();
    }
    res.status(403).json({ error: "Admin access required" });
  });
}

// This installation is intentionally a local, single-administrator tool. Live
// Zendesk writes must never be available to a viewer or another network device.
export function requireLocalAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    const remoteAddress = req.socket?.remoteAddress || "";
    const isLocal = remoteAddress === "::1"
      || remoteAddress === "127.0.0.1"
      || remoteAddress === "::ffff:127.0.0.1";
    if (!isLocal) {
      return res.status(403).json({ error: "Live publishing is available only from this computer." });
    }
    next();
  });
}
