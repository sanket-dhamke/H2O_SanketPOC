import { Router } from "express";
import { prisma } from "../prisma.js";
import { enqueuePush } from "../queue.js";
import { verifyVisitorToken } from "../ivr.js";

// Telephony webhook endpoints for the IVR visitor-approval fallback. These are
// hit by the provider (Twilio/Exotel), NOT by the app, so they are public but
// protected by a signed `?t=` token bound to the visitor id. They speak plain
// TwiML which both Twilio and Exotel's App flow understand.
export const ivrRouter = Router();

const xml = (res, body) => res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`);

function guard(req, res) {
  const { id } = req.params;
  const t = req.query.t || req.body?.t;
  if (!verifyVisitorToken(id, t)) {
    res.status(403).type("application/xml").send('<?xml version="1.0"?><Response><Reject/></Response>');
    return false;
  }
  return true;
}

// Step 1: greet + gather a keypress. The prompt is bilingual (Hindi + English)
// so it works for the elderly residents this feature targets.
ivrRouter.all("/ivr/visitor/:id/voice", async (req, res) => {
  if (!guard(req, res)) return;
  const visitor = await prisma.visitor.findUnique({ where: { id: req.params.id }, include: { flat: true } }).catch(() => null);
  if (!visitor) return xml(res, "<Say>Sorry, this request is no longer valid.</Say><Hangup/>");
  const who = `${visitor.name}, ${visitor.purpose || "visitor"}, for flat ${visitor.flat?.flatNo || ""}`;
  const action = `/api/ivr/visitor/${visitor.id}/gather?t=${req.query.t || ""}`;
  xml(
    res,
    `<Gather numDigits="1" action="${action}" method="POST" timeout="8">` +
      `<Say language="hi-IN">GateMate. ${who} gate par hain. Andar bhejne ke liye ek dabaayein. Mana karne ke liye do dabaayein.</Say>` +
      `<Say language="en-IN">${who} is at the gate. Press 1 to allow, press 2 to deny.</Say>` +
      `</Gather>` +
      `<Say>No input received. Goodbye.</Say>`
  );
});

// Step 2: apply the pressed digit as the resident's decision and notify the guard.
ivrRouter.all("/ivr/visitor/:id/gather", async (req, res) => {
  if (!guard(req, res)) return;
  const digit = String(req.body?.Digits || req.query.Digits || "").trim();
  const status = digit === "1" ? "approved" : digit === "2" ? "rejected" : null;
  if (!status) return xml(res, "<Say>Invalid choice. Goodbye.</Say><Hangup/>");

  const visitor = await prisma.visitor.findUnique({ where: { id: req.params.id }, include: { flat: true } }).catch(() => null);
  if (!visitor) return xml(res, "<Say>This request is no longer valid.</Say><Hangup/>");
  // Don't overwrite a decision already made in the app.
  if (visitor.status === "pending") {
    const updated = await prisma.visitor.update({
      where: { id: visitor.id },
      data: { status, decidedAt: new Date(), decidedBy: "ivr" },
      include: { flat: true },
    });
    const guardUser = updated.guardId ? await prisma.user.findUnique({ where: { id: updated.guardId } }) : null;
    if (guardUser?.expoPushToken) {
      const label = status === "approved" ? "APPROVED - let them in" : "REJECTED - do not allow";
      enqueuePush(
        guardUser.expoPushToken,
        `Flat ${updated.flat?.flatNo}: ${label}`,
        `${updated.name} was ${status} by the resident over phone.`,
        { type: "decision", visitorId: updated.id }
      );
    }
  }
  const say = status === "approved" ? "Approved. Thank you." : "Denied. Thank you.";
  xml(res, `<Say language="hi-IN">Dhanyavaad.</Say><Say>${say}</Say><Hangup/>`);
});
