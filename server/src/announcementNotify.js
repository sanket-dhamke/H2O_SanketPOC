// When an admin posts a society notice, tell every active member on the
// channels they actually have: email if there is an email, WhatsApp if there
// is a phone, and a phone push if this account already has a device token.
// A missing channel is skipped. A failed send never fails the post.

import { sendEmail } from "./email.js";
import { sendPush } from "./push.js";
import { sendSocietyNotice } from "./whatsapp.js";

export function reminderAudience(users, { authorId } = {}) {
  return (users || []).filter((user) => {
    if (!user) return false;
    if (user.active === false || user.pendingApproval) return false;
    if (authorId && user.id === authorId) return false;
    return true;
  });
}

export function channelsFor(user) {
  const email = String(user?.email || "").trim();
  const phone = String(user?.phone || "").trim();
  const push = user?.notifyEnabled !== false && user?.expoPushToken ? user.expoPushToken : null;
  return {
    email: email || null,
    phone: phone || null,
    push,
  };
}

export function buildAnnouncementEmail({ title, body, societyName }) {
  const subject = societyName ? `${societyName}: ${title}` : String(title || "Society notice");
  const text = [body, "", "Open GATEZO. This notice is also under Needs your attention."].filter((line) => line != null).join("\n");
  return { subject, text };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

// sendEmail / sendWhatsApp / sendPush are injectable so a test can prove who
// gets which channel without contacting Resend or Meta.
export async function deliverAnnouncementReminders({
  users,
  announcement,
  societyName,
  authorId,
  sendEmail: emailFn = sendEmail,
  sendWhatsApp: whatsappFn = sendSocietyNotice,
  sendPush: pushFn = sendPush,
}) {
  const audience = reminderAudience(users, { authorId });
  const mail = buildAnnouncementEmail({
    title: announcement?.title,
    body: announcement?.body,
    societyName,
  });
  const results = await mapPool(audience, 8, async (user) => {
    const channels = channelsFor(user);
    const result = { email: false, whatsapp: false, push: false };
    if (channels.email) {
      try {
        const sent = await emailFn({ to: channels.email, subject: mail.subject, text: mail.text });
        result.email = Boolean(sent?.delivered || sent?.dev);
      } catch (err) {
        console.error("[announcement] email failed:", err.message);
      }
    }
    if (channels.phone) {
      try {
        const sent = await whatsappFn({
          toPhone: channels.phone,
          name: user.name,
          societyName,
          title: announcement?.title,
          body: announcement?.body,
        });
        result.whatsapp = Boolean(sent?.sent || sent?.dev);
      } catch (err) {
        console.error("[announcement] whatsapp failed:", err.message);
      }
    }
    if (channels.push) {
      try {
        const sent = await pushFn(channels.push, mail.subject, String(announcement?.body || "").slice(0, 140), {
          type: "announcement",
          announcementId: announcement?.id || null,
        });
        result.push = Boolean(sent?.ok);
      } catch (err) {
        console.error("[announcement] push failed:", err.message);
      }
    }
    return result;
  });

  return {
    audience: audience.length,
    emailed: results.filter((r) => r?.email).length,
    whatsapp: results.filter((r) => r?.whatsapp).length,
    pushed: results.filter((r) => r?.push).length,
  };
}

export async function remindSocietyAboutAnnouncement(prisma, announcement) {
  if (!announcement?.societyId) return { audience: 0, emailed: 0, whatsapp: 0, pushed: 0 };
  const [society, users] = await Promise.all([
    prisma.society.findUnique({ where: { id: announcement.societyId }, select: { name: true } }),
    prisma.user.findMany({
      where: { societyId: announcement.societyId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        pendingApproval: true,
        notifyEnabled: true,
        expoPushToken: true,
      },
    }),
  ]);
  return deliverAnnouncementReminders({
    users,
    announcement,
    societyName: society?.name || "",
    authorId: announcement.createdBy,
  });
}
