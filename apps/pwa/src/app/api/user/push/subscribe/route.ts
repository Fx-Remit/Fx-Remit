import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@fx-remit/database';
import { NotificationService, isAllowedWebPushEndpoint } from '@fx-remit/services';

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

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
    const authKey = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { error: 'endpoint and keys.p256dh / keys.auth required' },
        { status: 400 },
      );
    }

    if (!isAllowedWebPushEndpoint(endpoint)) {
      return NextResponse.json(
        { error: 'Push endpoint host is not allowed' },
        { status: 400 },
      );
    }

    await NotificationService.upsertPushSubscription({
      userId: auth.user.id,
      endpoint,
      p256dh,
      auth: authKey,
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PUSH_SUBSCRIBE] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown';
    if (message.includes('not allowed')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
    }

    const deleted = await NotificationService.deletePushSubscription(auth.user.id, endpoint);
    if (!deleted) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PUSH_SUBSCRIBE] DELETE error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
