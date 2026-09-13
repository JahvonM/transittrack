import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Self-service role selection is limited to non-privileged roles.
// The privileged 'company' (fleet operator) role must be granted by an admin
// through a separate admin-gated flow — never self-assigned at registration.
const ALLOWED_ROLES = ["driver", "staff"];

export default async function applyUserRole(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    const role = body?.role;
    if (!ALLOWED_ROLES.includes(role)) {
      return Response.json(
        { error: 'Invalid role.' },
        { status: 400 }
      );
    }
    // Fetch the authoritative role server-side — never trust the client token's snapshot.
    const fresh = await base44.asServiceRole.entities.User.get(user.id);
    const isAdmin = fresh.role === 'admin';
    // Only an admin, or a brand-new user (default role) setting their role once during
    // registration, may set it. Anyone already assigned a role must ask an admin.
    if (!isAdmin && fresh.role && fresh.role !== 'passenger') {
      return Response.json(
        { error: 'Your role is already set. Contact an admin to change it.' },
        { status: 403 }
      );
    }
    await base44.asServiceRole.entities.User.update(user.id, { role });
    return Response.json({ success: true, role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}