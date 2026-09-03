import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const ALLOWED_ROLES = ["passenger", "driver", "staff", "company"];

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
        { error: 'Admin access must be granted by an existing administrator from the admin dashboard.' },
        { status: 400 }
      );
    }
    await base44.asServiceRole.entities.User.update(user.id, { role });
    return Response.json({ success: true, role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}