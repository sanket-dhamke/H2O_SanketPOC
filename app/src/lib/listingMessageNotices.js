// Buy & Sell replies that still need the person. Home asks /listing-inbox and
// puts these rows above the other attention items. Passed-date filtering is
// applied before this merge so a message that mentions a date is not dropped.

export function withListingNotices(summary, notices) {
  if (!summary || notices == null) return summary;
  const extra = (notices || []).filter((notice) => notice && notice.key);
  const rest = (summary.pending || []).filter((item) => !String(item.key || "").startsWith("listing-message:"));
  return { ...summary, pending: [...extra, ...rest] };
}
