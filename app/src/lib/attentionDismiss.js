// A person can take a row off "Needs your attention" without resolving the
// underlying bill or visit. The signature includes the label, so a bill whose
// amount changes comes back, while the same notice stays hidden. A listing
// message key already contains the message id, so a newer message is a new row.

export function attentionSignature(item) {
  return `${item?.key || ""}::${item?.label || ""}`;
}

export function hideDismissed(summary, dismissed) {
  if (!summary) return summary;
  const hide = new Set(dismissed || []);
  return {
    ...summary,
    pending: (summary.pending || []).filter((item) => {
      // A due bill stays until it is paid. Remove applies to notices and visits.
      if (item?.key === "bills") return true;
      if (item?.announcementId && hide.has(item.announcementId)) return false;
      if (hide.has(attentionSignature(item))) return false;
      return true;
    }),
  };
}
