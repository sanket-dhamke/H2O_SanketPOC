// Per-tenant vocabulary. A tenant's orgType ("society" | "preschool") decides
// which labels the app shows. Society tenants keep the original wording, so
// existing societies are completely unchanged.
const LABELS = {
  society: {
    org: "Society",
    unit: "Flat",
    units: "Flats",
    member: "Resident",
    members: "Residents",
    fees: "Maintenance",
    feesShort: "Maintenance",
    wing: "Wing",
    wings: "Wings",
    gate: "Gate log",
    visitor: "Visitor",
    visitors: "Visitors",
  },
  preschool: {
    org: "Preschool",
    unit: "Student",
    units: "Students",
    member: "Parent",
    members: "Parents",
    fees: "Fees",
    feesShort: "Fees",
    wing: "Class",
    wings: "Classes",
    gate: "Gate log",
    visitor: "Visitor",
    visitors: "Visitors",
  },
};

export function orgTypeOf(user) {
  return user?.societyOrgType === "preschool" ? "preschool" : "society";
}

export function isPreschool(user) {
  return orgTypeOf(user) === "preschool";
}

// Returns the label set for a user's tenant. Usage: const L = labelsFor(user); L.units
export function labelsFor(user) {
  return LABELS[orgTypeOf(user)] || LABELS.society;
}
