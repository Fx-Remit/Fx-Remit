import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';

export const dynamic = 'force-dynamic';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET?.trim() ?? '';

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

async function requireUser(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing authorization header' }, { status: 401 }) };
  }

  let claims;
  try {
    claims = await privy.verifyAuthToken(authHeader.slice(7));
  } catch {
    return { error: NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { privyDid: claims.userId },
    select: { id: true },
  });

  if (!user) {
    return { error: NextResponse.json({ error: 'User profile not found' }, { status: 404 }) };
  }

  return { user };
}

/** Authenticated profile edit scoped by the token-verified user id, never a client-supplied one. */
export async function PATCH(req: Request) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : undefined;
    const avatarUrl = typeof body?.avatarUrl === 'string' ? body.avatarUrl.trim() : undefined;

    if (displayName !== undefined && (displayName.length === 0 || displayName.length > 60)) {
      return NextResponse.json(
        { error: 'displayName must be 1-60 characters' },
        { status: 400 },
      );
    }

    const data: { displayName?: string; avatarUrl?: string } = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data,
    });

    return NextResponse.json({
      success: true,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
    });
  } catch (error) {
    console.error('[PROFILE_PATCH] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
