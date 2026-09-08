import type { APIRoute } from 'astro';
import crypto from 'node:crypto';

const HMAC_SECRET =
  process.env.UNSUBSCRIBE_SECRET ||
  process.env.RESEND_API_KEY ||
  'gcp-cloud-radar-unsubscribe-secret-v1';

function verifyToken(email: string, token: string): boolean {
  if (!email || !token) return false;
  const normalizedEmail = email.toLowerCase().trim();
  const expectedToken = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(normalizedEmail)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedToken.toLowerCase()),
      Buffer.from(token.trim().toLowerCase())
    );
  } catch {
    return false;
  }
}

async function updateFirestoreSubscription(email: string): Promise<boolean> {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const url = `http://${firestoreHost}/v1/projects/gcp-cloud-radar/databases/radar/documents/users`;

  try {
    const listResp = await fetch(url);
    if (!listResp.ok) return false;
    const data = await listResp.json();
    const docs = data.documents || [];

    let updated = false;
    for (const doc of docs) {
      const fields = doc.fields || {};
      const docEmail = fields.email?.stringValue?.toLowerCase()?.trim() || '';
      if (docEmail === email.toLowerCase().trim()) {
        const patchUrl = `http://${firestoreHost}/v1/${doc.name}?updateMask.fieldPaths=breakingAlerts&updateMask.fieldPaths=weeklyDigest`;
        await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              email: { stringValue: fields.email?.stringValue || email },
              breakingAlerts: { booleanValue: false },
              weeklyDigest: { booleanValue: false },
            },
          }),
        });
        updated = true;
      }
    }

    if (!updated) {
      const safeId = email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      await fetch(`${url}?documentId=unsub_${safeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            email: { stringValue: email },
            breakingAlerts: { booleanValue: false },
            weeklyDigest: { booleanValue: false },
          },
        }),
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to update Firestore subscription:', err);
    return false;
  }
}

export const ALL: APIRoute = async ({ request, url }) => {
  let email = url.searchParams.get('email') || '';
  let token = url.searchParams.get('token') || '';

  if ((!email || !token) && request.method === 'POST') {
    try {
      const body = await request.clone().json();
      if (body?.email) email = body.email;
      if (body?.token) token = body.token;
    } catch {
      try {
        const formData = await request.clone().formData();
        if (formData.get('email')) email = String(formData.get('email'));
        if (formData.get('token')) token = String(formData.get('token'));
      } catch {}
    }
  }

  if (!email || !token || !verifyToken(email, token)) {
    return new Response(
      JSON.stringify({ error: 'Invalid or tampered unsubscribe token' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  await updateFirestoreSubscription(email);

  return new Response(
    JSON.stringify({
      status: 'success',
      message: `Successfully unsubscribed ${email}`,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
};
