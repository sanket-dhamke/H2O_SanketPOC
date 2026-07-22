// Subscription plan helpers. A society is "premium" when plan === "premium" and
// the plan hasn't expired. Premium unlocks perks like the vendor venue marketplace.
export function isPremium(society) {
  if (!society) return false;
  if (society.plan !== "premium") return false;
  if (society.planExpiresAt && new Date(society.planExpiresAt) < new Date()) return false;
  return true;
}

export function planStatus(society) {
  const premium = isPremium(society);
  const expired = society?.plan === "premium" && !premium;
  return {
    plan: society?.plan || "free",
    premium,
    expired,
    planExpiresAt: society?.planExpiresAt || null,
    planAmount: society?.planAmount ?? null,
  };
}
