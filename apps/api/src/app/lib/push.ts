import { createSign, randomUUID, sign } from "node:crypto";
import { connect } from "node:http2";
import type { Notification, PushSubscription } from "@board-game-organizer/schemas";
import type { ObjectId } from "mongodb";
import { COLLECTIONS, getDb } from "@/app/lib/db";
import { PushSubscriptionsRepository } from "@/app/lib/push-subscriptions.repository";

let googleAccessToken: { value: string; expiresAt: number } | undefined;
let apnsToken: { value: string; expiresAt: number } | undefined;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function privateKey(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n").trim() || undefined;
}

async function getGoogleAccessToken(): Promise<string | null> {
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now()) return googleAccessToken.value;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const key = privateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!clientEmail || !key) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(key, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth token request failed (${response.status})`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Google OAuth token response is missing access_token");
  googleAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 3600) - 300) * 1000,
  };
  return googleAccessToken.value;
}

async function sendFcm(
  subscription: PushSubscription,
  notification: Notification,
): Promise<"sent" | "invalid" | "skipped"> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const accessToken = await getGoogleAccessToken();
  if (!projectId || !accessToken) return "skipped";

  const data = {
    notificationId: notification._id.toHexString(),
    kind: notification.kind,
    href: notification.href,
    title: notification.title,
    description: notification.description,
  };
  const message =
    subscription.platform === "web"
      ? { token: subscription.token, data, webpush: { headers: { Urgency: "high" } } }
      : {
          token: subscription.token,
          notification: { title: notification.title, body: notification.description },
          data,
          android: { priority: "high" as const },
        };
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
  if (response.ok) return "sent";
  const payload = (await response.json().catch(() => null)) as {
    error?: { details?: Array<{ errorCode?: string }> };
  } | null;
  return payload?.error?.details?.some((detail) =>
    ["UNREGISTERED", "SENDER_ID_MISMATCH"].includes(detail.errorCode ?? ""),
  )
    ? "invalid"
    : "skipped";
}

function getApnsToken(): string | null {
  if (apnsToken && apnsToken.expiresAt > Date.now()) return apnsToken.value;
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const key = privateKey(process.env.APNS_PRIVATE_KEY);
  if (!keyId || !teamId || !key) return null;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "ES256", kid: keyId }))}.${base64Url(
    JSON.stringify({ iss: teamId, iat: now }),
  )}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  apnsToken = { value: `${unsigned}.${signature}`, expiresAt: Date.now() + 50 * 60 * 1000 };
  return apnsToken.value;
}

async function sendApns(
  subscription: PushSubscription,
  notification: Notification,
): Promise<"sent" | "invalid" | "skipped"> {
  const token = getApnsToken();
  const topic = process.env.APNS_BUNDLE_ID?.trim();
  if (!token || !topic) return "skipped";
  const host =
    process.env.APNS_PRODUCTION === "true" ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  return new Promise((resolve) => {
    const client = connect(`https://${host}`);
    client.setTimeout(10_000, () => {
      client.close();
      resolve("skipped");
    });
    client.once("error", () => {
      client.close();
      resolve("skipped");
    });
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${subscription.token}`,
      authorization: `bearer ${token}`,
      "apns-id": randomUUID(),
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    let status = 0;
    let body = "";
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      client.close();
      let reason = "";
      try {
        reason = (JSON.parse(body) as { reason?: string }).reason ?? "";
      } catch {
        reason = "";
      }
      resolve(
        status === 200
          ? "sent"
          : status === 410 ||
              ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason)
            ? "invalid"
            : "skipped",
      );
    });
    request.on("error", () => {
      client.close();
      resolve("skipped");
    });
    request.end(
      JSON.stringify({
        aps: {
          alert: { title: notification.title, body: notification.description },
          sound: "default",
        },
        notificationId: notification._id.toHexString(),
        kind: notification.kind,
        href: notification.href,
      }),
    );
  });
}

export async function dispatchNotifications(ids: ObjectId[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const notifications = await db
    .collection<Notification>(COLLECTIONS.NOTIFICATIONS)
    .find({ _id: { $in: ids } })
    .toArray();
  const subscriptions = new PushSubscriptionsRepository(db);

  for (const notification of notifications) {
    const targets = await subscriptions.listByUser(notification.recipientUserId);
    for (const target of targets) {
      try {
        const result =
          target.provider === "apns"
            ? await sendApns(target, notification)
            : await sendFcm(target, notification);
        if (result === "invalid") await subscriptions.removeToken(target.token);
      } catch (error) {
        console.error("Push notification delivery failed", {
          notificationId: notification._id.toHexString(),
          provider: target.provider,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }
}
