import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { NotificationService } from '@fx-remit/services';

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

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const rawLimit = Number(searchParams.get('limit') || 50);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;

    const result = await NotificationService.listForUser(auth.user.id, { limit });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[NOTIFICATIONS] Unhandled error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    if (body?.all === true) {
      const count = await NotificationService.markAllRead(auth.user.id);
      return NextResponse.json({ success: true, count });
    }

    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id: unknown) => typeof id === 'string' && id.length > 0)
      : typeof body?.id === 'string'
        ? [body.id]
        : [];

    if (!ids.length) {
      return NextResponse.json({ error: 'ids or all required' }, { status: 400 });
    }

    const count = await NotificationService.markRead(auth.user.id, ids);
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('[NOTIFICATIONS] PATCH error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
