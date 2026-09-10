import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DonutChart from "./DonutChart";
import TrendBars from "./TrendBars";
import { body, head } from "../lib/type";
import { openScreen } from "../lib/nav";

// One palette for the whole dashboard so a colour always means the same thing:
// green is settled, orange needs action, red is a problem.
const VISITOR_COLORS = {
  approved: "#1E7A3D",
  pending: "#C2571A",
  leave_at_gate: "#0B6E8F",
  rejected: "#B42318",
  other: "#8895A0",
};
const VISITOR_STATUS = [
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
];
const FINANCE_COLORS = { paid: "#1E7A3D", pending: "#C2571A" };
const LEVEL_COLORS = { critical: "#B42318", warn: "#C2571A", info: "#0B6E8F", ok: "#1E7A3D" };
const CHART_SIZE = 128;

const money = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
// Long rupee figures don't fit inside a donut, so compact them there only.
const moneyShort = (n) => {
  const v = Math.round(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return `₹${v}`;
};

function Legend({ segments, total, format }) {
  const sum = total ?? segments.reduce((n, s) => n + (s.value || 0), 0);
  return (
    <View style={styles.legend}>
      {segments.map((s) => {
        const pct = sum ? `${Math.round(((s.value || 0) / sum) * 100)}%` : "—";
        const value = format ? format(s.value) : String(s.value ?? 0);
        return (
          <View key={s.key} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>{s.label}</Text>
            <Text style={styles.legendMeta} numberOfLines={1}>
              {value} · {pct}
            </Text>
          </View>
        );
      })}
      {total != null ? (
        <View style={[styles.legendRow, styles.legendTotal]}>
          <Text style={styles.legendLabel} numberOfLines={1}>Total</Text>
          <Text style={styles.legendTotalValue} numberOfLines={1}>{format(total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Card({ title, hint, icon, children, fill, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapProps = onPress ? { onPress, activeOpacity: 0.86, accessibilityRole: "button" } : {};
  return (
    <Wrapper style={[styles.card, fill && { flex: 1, marginBottom: 0 }]} {...wrapProps}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitleRow}>
          {icon ? (
            <View style={styles.cardIcon}>
              <Ionicons name={icon} size={14} color="#0B6E8F" />
            </View>
          ) : null}
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <View style={styles.cardHeadRight}>
          {hint ? (
            <View style={styles.hintPill}>
              <Text style={styles.cardHint}>{hint}</Text>
            </View>
          ) : null}
          {onPress ? <Ionicons name="chevron-forward" size={16} color="#8AA0AA" /> : null}
        </View>
      </View>
      {children}
    </Wrapper>
  );
}

// The graphical account summary on the home tab: what needs you now, who came
// through the gate, and where the money stands — all from one API call.
export default function HomeSummary({ data, loading, navigation, labels }) {
  const { width } = useWindowDimensions();
  const stackCharts = width < 720;

  if (loading && !data) {
    return (
      <View style={[styles.card, styles.stateBox]}>
        <ActivityIndicator color="#0B6E8F" />
        <Text style={styles.stateText}>Loading your summary…</Text>
      </View>
    );
  }

  // Hide rather than show a dead card: the live API does not yet have
  // /home-summary, and a network blip should not punch a hole in Home.
  if (!data) return null;

  const { visitors, finance, trend, pending = [], defaulters = [] } = data;
  const isAdmin = data.role === "admin";

  const byKey = Object.fromEntries((visitors?.segments || []).map((s) => [s.key, s]));
  const visitorSegments = VISITOR_STATUS.map((s) => ({
    key: s.key,
    label: s.label,
    value: byKey[s.key]?.value || 0,
    color: VISITOR_COLORS[s.key],
  }));
  const extraVisitor = (visitors?.segments || [])
    .filter((s) => !VISITOR_STATUS.some((v) => v.key === s.key) && s.value > 0)
    .map((s) => ({
      ...s,
      label: s.label || (s.key === "leave_at_gate" ? "Left at gate" : s.key),
      color: VISITOR_COLORS[s.key] || VISITOR_COLORS.other,
    }));
  visitorSegments.push(...extraVisitor);
  const financeSegments = (finance?.segments || []).map((s) => ({
    ...s,
    color: FINANCE_COLORS[s.key] || VISITOR_COLORS.other,
  }));
  const trendMonths = (trend || []).slice(-4);

  const go = (item) => {
    if (!item.route) return;
    openScreen(navigation, item.route, item.params || undefined);
  };
  const openVisitors = () => openScreen(navigation, "Visitors");
  const billsRoute = isAdmin ? "Finance" : data.role === "resident" ? "Maintenance" : null;
  const openBills = billsRoute ? () => openScreen(navigation, billsRoute) : undefined;

  return (
    <View>
      {pending.length > 0 ? (
        <View style={styles.attention}>
          <Text style={styles.attentionTitle}>Needs your attention</Text>
          {pending.map((p) => {
            const color = LEVEL_COLORS[p.level] || LEVEL_COLORS.info;
            return (
              <TouchableOpacity
                key={p.key}
                style={styles.alertRow}
                onPress={() => go(p)}
                activeOpacity={p.route ? 0.75 : 1}
              >
                <View style={[styles.alertIcon, { backgroundColor: `${color}1A` }]}>
                  <Ionicons name={p.icon || "alert-circle-outline"} size={17} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertLabel}>{p.label}</Text>
                  {p.detail ? <Text style={styles.alertDetail}>{p.detail}</Text> : null}
                </View>
                {p.route ? <Ionicons name="chevron-forward" size={18} color="#B7C2C9" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.chartsRow, stackCharts && styles.chartsRowStack]}>
        <View style={[styles.chartCol, stackCharts && styles.chartColStack]}>
      <Card fill icon="people-outline" title={labels.visitors || "Visitors"} hint={`Last ${visitors?.windowDays || 30} days`} onPress={openVisitors}>
        <View style={styles.vizRow}>
          <View style={styles.vizMain}>
            <View style={styles.donutSlot}>
              <DonutChart
                size={CHART_SIZE}
                thickness={14}
                segments={visitorSegments}
                centerValue={String(visitors?.total ?? 0)}
                centerLabel={visitors?.total === 1 ? "entry" : "entries"}
              />
            </View>
            <Legend segments={visitorSegments} />
          </View>
          {trendMonths.length ? (
            <View style={styles.vizTrend}>
              <Text style={styles.trendTitle}>Last 4 months</Text>
              <TrendBars data={trendMonths} color="#0B6E8F" height={44} showLegend={false} />
            </View>
          ) : null}
        </View>
      </Card>
        </View>

        {finance ? (
          <View style={[styles.chartCol, stackCharts && styles.chartColStack]}>
        <Card
          fill
          icon="wallet-outline"
          title={isAdmin ? `${labels.fees || "Collections"} this month` : labels.fees || "Maintenance"}
          hint={`${finance.paidPct}% settled`}
          onPress={openBills}
        >
          <View style={styles.chartRow}>
            <View style={styles.donutSlot}>
              <DonutChart
                size={CHART_SIZE}
                thickness={14}
                segments={financeSegments}
                centerValue={moneyShort(finance.pending)}
                centerLabel={finance.pending > 0 ? "due" : "clear"}
              />
            </View>
            <Legend segments={financeSegments} total={finance.billed} format={money} />
          </View>

          {isAdmin ? (
            <View style={styles.statStrip}>
              <Stat label="Balance" value={money(finance.balance)} />
              <Stat label="Expenses" value={money(finance.totalExpenses)} />
              <Stat
                label="vs last month"
                value={`${finance.collectionDeltaPct > 0 ? "+" : ""}${finance.collectionDeltaPct}%`}
                tint={finance.collectionDeltaPct < 0 ? "#B42318" : "#1E7A3D"}
              />
            </View>
          ) : (
            <View style={styles.statStrip}>
              <Stat label="Billed" value={money(finance.billed)} />
              <Stat label="Paid" value={money(finance.paid)} tint="#1E7A3D" />
              <Stat
                label="Outstanding"
                value={money(finance.pending)}
                tint={finance.pending > 0 ? "#C2571A" : "#1E7A3D"}
              />
            </View>
          )}
        </Card>
          </View>
        ) : null}
      </View>

      {isAdmin && defaulters.length ? (
        <Card title="Top pending" hint="Highest outstanding">
          {defaulters.map((d) => (
            <View key={d.flatNo} style={styles.defaulterRow}>
              <Text style={styles.defaulterUnit}>{d.flatNo}</Text>
              <View style={styles.defaulterBarTrack}>
                <View
                  style={[
                    styles.defaulterBar,
                    { width: `${Math.max(6, (d.pending / Math.max(1, defaulters[0].pending)) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.defaulterValue}>{money(d.pending)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function Stat({ label, value, tint = "#1B2B33" }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tint }]} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E6EEF2",
    shadowColor: "#0B3A49",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, paddingRight: 8 },
  cardIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#EAF4F8",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 14.5, ...head(700), color: "#0B3A49" },
  hintPill: {
    backgroundColor: "#F3F7F9",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  cardHint: { fontSize: 11, color: "#5C7380", ...body(600) },
  cardHeadRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  stateBox: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 24 },
  stateText: { color: "#6B7B85", fontSize: 13, ...body(400)},
  attention: {
    backgroundColor: "#FFF8F5",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F3DDD4",
    borderLeftWidth: 3,
    borderLeftColor: "#C2571A",
  },
  attentionTitle: {
    fontSize: 11,
    ...head(700),
    color: "#C2571A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  alertIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  alertLabel: { fontSize: 13.5, ...head(700), color: "#1B2B33" },
  alertDetail: { fontSize: 12, color: "#6B7B85", marginTop: 1, ...body(400)},
  vizRow: { gap: 16 },
  vizMain: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  donutSlot: { width: CHART_SIZE, height: CHART_SIZE, flexShrink: 0, overflow: "hidden" },
  vizTrend: { width: "100%", marginTop: 4 },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 128,
  },
  legend: {
    flex: 1,
    minWidth: 0,
    gap: 8,
    justifyContent: "center",
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendTotal: { borderTopWidth: 1, borderTopColor: "#EDF2F4", paddingTop: 8, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendLabel: { flex: 1, minWidth: 0, fontSize: 13, color: "#3A4A54", ...body(600) },
  legendMeta: { fontSize: 12.5, color: "#5C7380", ...body(600), flexShrink: 0 },
  legendTotalValue: { fontSize: 13, ...body(700), color: "#0B3A49", flexShrink: 0 },
  emptyNote: { flex: 1, fontSize: 12.5, color: "#8895A0", lineHeight: 18, ...body(400)},
  chartsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, width: "100%", alignItems: "stretch" },
  chartsRowStack: { flexDirection: "column" },
  chartCol: { flexGrow: 1, flexShrink: 1, flexBasis: 340, minWidth: 0, marginBottom: 12 },
  chartColStack: { flexBasis: "100%", width: "100%", minWidth: 0 },
  trendBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#F0F4F6", paddingTop: 12 },
  trendTitle: { fontSize: 11, ...body(700), color: "#8895A0", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  statStrip: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  stat: {
    flex: 1,
    backgroundColor: "#F5F9FB",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statValue: { fontSize: 14, ...head(700), marginTop: 2 },
  statLabel: { fontSize: 11, color: "#8895A0", ...body(600) },
  defaulterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  defaulterUnit: { width: 62, fontSize: 12.5, ...body(700), color: "#3A4A54" },
  defaulterBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#F1F5F7", overflow: "hidden" },
  defaulterBar: { height: 8, borderRadius: 4, backgroundColor: "#C2571A" },
  defaulterValue: { width: 78, textAlign: "right", fontSize: 12.5, ...body(700), color: "#3A4A54" },
});
