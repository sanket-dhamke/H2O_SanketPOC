// Per-tenant vocabulary. A tenant's orgType ("society" | "preschool") decides
// which labels the app shows. Society tenants keep the original wording, so
// existing societies are completely unchanged.
const LABELS = {
  society: {
    org: "Society",
    unit: "Flat",
    units: "Flats",
    payer: "Resident", // fee-paying occupant
    payers: "Residents",
    members: "Members", // people with app accounts (screen/tab)
    membersSub: "Residents, guards & admins",
    fees: "Maintenance",
    feesShort: "Maintenance",
    wing: "Wing",
    wings: "Wings",
    gate: "Gate log",
    visitor: "Visitor",
    visitors: "Visitors",
    roleAdmin: "Society admin",
    balanceLabel: "Society balance",
    remindLabel: "Remind unpaid residents",
    gateAdminSub: "See who visited the society",
    manageTile: "Manage members & flats",
    manageTileSub: "Accounts, flats & bank details",
    amenities: "Amenities",
    amenitiesSubResident: "Book your clubhouse & facilities",
    amenitiesSubAdmin: "Approve bookings & manage facilities",
    amenitiesAdminBtn: "Amenities & clubhouse bookings",
    amenityExample: "Clubhouse / Party Hall",
    amenityEmptyResident:
      "No amenities are open for booking yet. Your admin can enable the clubhouse from their Amenities screen.",
    amenityEmptyAdmin: "No amenities yet. Tap + to add your clubhouse or facility.",
    reportsSub: "Wing-wise history & exports",
  },
  preschool: {
    org: "Preschool",
    unit: "Student",
    units: "Students",
    payer: "Parent",
    payers: "Parents",
    members: "Accounts",
    membersSub: "Guards & admins",
    fees: "Fees",
    feesShort: "Fees",
    wing: "Class",
    wings: "Classes",
    gate: "Gate log",
    visitor: "Visitor",
    visitors: "Visitors",
    roleAdmin: "Preschool admin",
    balanceLabel: "Fees balance",
    remindLabel: "Remind pending fees",
    gateAdminSub: "See who entered the preschool",
    manageTile: "Manage staff & students",
    manageTileSub: "Accounts, students & bank details",
    amenities: "Hall booking",
    amenitiesSubResident: "Book the open hall & rooms",
    amenitiesSubAdmin: "Approve hall bookings & manage halls",
    amenitiesAdminBtn: "Open hall bookings",
    amenityExample: "Open Hall / Activity Room",
    amenityEmptyResident:
      "No halls are open for booking yet. Your admin can enable the open hall from their Hall booking screen.",
    amenityEmptyAdmin: "No halls yet. Tap + to add your open hall or activity room.",
    reportsSub: "Visitors & staff attendance",
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
