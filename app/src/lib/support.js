// H2O support contact details shown in every user's profile. Update these in one
// place. (For a real launch, swap in your official support number/email/site.)
export const SUPPORT = {
  phone: "+91 90000 12345",
  email: "support@h2oapp.in",
  hours: "Mon–Sat, 9am – 7pm IST",
  website: "https://h2oapp.in",
};

// A short, human-friendly member/staff ID derived from the user's UUID.
export function memberId(user) {
  if (!user?.id) return "—";
  const short = String(user.id).replace(/-/g, "").slice(0, 6).toUpperCase();
  const prefix =
    user.role === "resident"
      ? "RES"
      : user.role === "guard"
      ? "GRD"
      : user.role === "admin"
      ? "ADM"
      : "OWN";
  return `H2O-${prefix}-${short}`;
}
