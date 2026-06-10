// Composite viewer check used by both middleware and server components.
// Returns true if the caller is allowed to read the journal, either because:
//   - they are the owner (EDIT_SECRET cookie), or
//   - they have a valid viewer session AND still hold the required Discord role
//
// The role check is cached (5 min) inside hasRequiredRole.

import { cookies } from 'next/headers';
import { EDIT_COOKIE } from '@/lib/edit-auth';
import { VIEWER_COOKIE, verifySession } from './session';
import { hasRequiredRole } from './discord';

export async function isAllowedViewer(): Promise<{ allowed: boolean; ownerBypass: boolean; uid?: string }> {
  const jar = await cookies();

  // Owner bypass: EDIT_SECRET cookie skips every check.
  const editSecret = process.env.EDIT_SECRET;
  if (editSecret && jar.get(EDIT_COOKIE)?.value === editSecret) {
    return { allowed: true, ownerBypass: true };
  }

  // Public viewer: valid session + still holds the role.
  // A misconfiguration (missing SESSION_SECRET / Discord env) must NOT 500 the
  // page — it fails closed: deny access and let the caller redirect to /login.
  // The owner bypass above is unaffected, so the owner can always get back in.
  try {
    const sess = verifySession(jar.get(VIEWER_COOKIE)?.value);
    if (!sess) return { allowed: false, ownerBypass: false };

    const stillMember = await hasRequiredRole(sess.uid);
    return { allowed: stillMember, ownerBypass: false, uid: sess.uid };
  } catch (err) {
    console.error('isAllowedViewer: viewer check failed, denying access:', err);
    return { allowed: false, ownerBypass: false };
  }
}
