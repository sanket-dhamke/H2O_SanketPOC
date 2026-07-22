import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Image,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

// Cross-platform alert: RN's Alert.alert is a no-op on web, so fall back to the
// browser's native dialog there (otherwise clicks appear to "do nothing").
function notify(title, message) {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

// Builds the branded-login links for a tenant. `web` opens the browser app
// already themed; `app` is a deep link that themes the installed mobile app.
function tenantLinks(slug) {
  const webOrigin =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.origin
      : "https://app.h2o.com"; // replace with your hosted web URL
  return {
    web: `${webOrigin}/?t=${slug}`,
    app: `h2o://?t=${slug}`,
  };
}

const money = (n) => `\u20B9${Number(n || 0).toLocaleString("en-IN")}`;

export default function SocietiesScreen() {
  const [societies, setSocieties] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [adminFor, setAdminFor] = useState(null); // society object when adding an admin
  const [planFor, setPlanFor] = useState(null); // society object when editing plan
  const [shareFor, setShareFor] = useState(null); // society object when sharing login link
  const [brandFor, setBrandFor] = useState(null); // society object when editing name/logo branding
  const [resetModal, setResetModal] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.superListSocieties();
      setSocieties(res.societies || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleActive = async (s) => {
    try {
      await api.superUpdateSociety(s.id, { active: !s.active });
      load();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const sendTestEmail = async () => {
    try {
      const r = await api.superTestEmail();
      if (!r.configured || r.dev) {
        notify("Email not configured", "No email provider is set up yet. Add RESEND_API_KEY (or SMTP) to the server env, then try again.");
      } else if (r.delivered) {
        notify("Test email sent", `Delivered to ${r.to}. Check the inbox.`);
      } else {
        notify("Send failed", r.error || "Email provider rejected the message.");
      }
    } catch (e) {
      notify("Error", e.message);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? societies.filter(
        (s) => (s.name || "").toLowerCase().includes(q) || (s.city || "").toLowerCase().includes(q)
      )
    : societies;

  const headerBtns = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <TouchableOpacity onPress={sendTestEmail} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="mail-outline" size={20} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setResetModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="key-outline" size={20} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setCreateModal(true)} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        icon="business"
        title="Societies"
        subtitle={`${societies.length} onboarded`}
        right={headerBtns}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {societies.length > 5 && (
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color="#6B7B85" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or city"
              placeholderTextColor="#9AA7AF"
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#B7C2C9" />
              </TouchableOpacity>
            )}
          </View>
        )}
        {societies.length === 0 && (
          <Text style={styles.empty}>No societies yet. Tap + to onboard the first one.</Text>
        )}
        {filtered.length === 0 && societies.length > 0 && (
          <Text style={styles.empty}>No tenants match “{query}”.</Text>
        )}
        {filtered.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.city}>
                  {s.orgType === "preschool" ? "🏫 Preschool" : "🏢 Society"}
                  {s.city ? ` · ${s.city}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={[styles.badge, s.active ? styles.badgeOn : styles.badgeOff]}>
                  <Text style={[styles.badgeText, s.active ? { color: "#1E7A3D" } : { color: "#9A3412" }]}>
                    {s.active ? "Active" : "Inactive"}
                  </Text>
                </View>
                <View style={[styles.badge, s.premium ? styles.badgePremium : styles.badgeFree]}>
                  <Text style={[styles.badgeText, s.premium ? { color: "#8A5A00" } : { color: "#5A6B75" }]}>
                    {s.premium ? "★ Premium" : "Free"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Chip icon="home" text={`${s.flats} flats`} />
              <Chip icon="people" text={`${s.residents} residents`} />
              <Chip icon="briefcase" text={`${s.admins} admin${s.admins === 1 ? "" : "s"}`} />
            </View>

            <View style={styles.finRow}>
              <View style={styles.finBox}>
                <Text style={styles.finLabel}>Collected</Text>
                <Text style={[styles.finVal, { color: "#2E9E52" }]}>{money(s.collected)}</Text>
              </View>
              <View style={styles.finBox}>
                <Text style={styles.finLabel}>Pending</Text>
                <Text style={[styles.finVal, { color: "#C2571A" }]}>{money(s.pending)}</Text>
              </View>
              <View style={styles.finBox}>
                <Text style={styles.finLabel}>Balance</Text>
                <Text style={styles.finVal}>{money(s.balance)}</Text>
              </View>
            </View>

            {!!s.adminEmails?.length && (
              <Text style={styles.admins} numberOfLines={1}>
                Admins: {s.adminEmails.join(", ")}
              </Text>
            )}

            {(s.premium || s.planAmount) && (
              <Text style={styles.planLine}>
                Plan: {s.premium ? "Premium" : s.plan}
                {s.planAmount ? ` · ${money(s.planAmount)}/yr` : ""}
                {s.planExpiresAt ? ` · until ${new Date(s.planExpiresAt).toLocaleDateString("en-IN")}` : ""}
              </Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionGhost} onPress={() => setAdminFor(s)}>
                <Ionicons name="person-add-outline" size={16} color="#0B6E8F" />
                <Text style={styles.actionGhostText}>Add admin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionGhost} onPress={() => setPlanFor(s)}>
                <Ionicons name="star-outline" size={16} color="#8A5A00" />
                <Text style={[styles.actionGhostText, { color: "#8A5A00" }]}>Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionGhost} onPress={() => setShareFor(s)}>
                <Ionicons name="qr-code-outline" size={16} color="#0B6E8F" />
                <Text style={styles.actionGhostText}>Login link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionGhost} onPress={() => setBrandFor(s)}>
                <Ionicons name="color-palette-outline" size={16} color="#6D3BD1" />
                <Text style={[styles.actionGhostText, { color: "#6D3BD1" }]}>Branding</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionGhost, !s.active && styles.actionOn]}
                onPress={() => toggleActive(s)}
              >
                <Ionicons
                  name={s.active ? "pause-circle-outline" : "play-circle-outline"}
                  size={16}
                  color={s.active ? "#C2571A" : "#1E7A3D"}
                />
                <Text style={[styles.actionGhostText, { color: s.active ? "#C2571A" : "#1E7A3D" }]}>
                  {s.active ? "Deactivate" : "Activate"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <CreateSocietyModal visible={createModal} onClose={() => setCreateModal(false)} onDone={load} />
      <AddAdminModal society={adminFor} onClose={() => setAdminFor(null)} onDone={load} />
      <EditPlanModal society={planFor} onClose={() => setPlanFor(null)} onDone={load} />
      <ShareLinkModal society={shareFor} onClose={() => setShareFor(null)} />
      <BrandingModal society={brandFor} onClose={() => setBrandFor(null)} onDone={load} />
      <ResetPasswordModal visible={resetModal} onClose={() => setResetModal(false)} />
    </View>
  );
}

// Shows a tenant's branded-login link + QR so the superadmin can hand it to a
// society/preschool. Opening the link auto-brands the login for that tenant.
function ShareLinkModal({ society, onClose }) {
  const visible = !!society;
  const slug = society?.slug;
  const links = slug ? tenantLinks(slug) : null;
  const isPre = society?.orgType === "preschool";
  const qrData = links ? encodeURIComponent(links.web) : "";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${qrData}`;

  const copy = async (text) => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        Alert.alert("Copied", "Link copied to clipboard.");
      } else {
        Alert.alert("Login link", text);
      }
    } catch {
      Alert.alert("Login link", text);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{isPre ? "Preschool" : "Society"} login link</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.shareIntro}>
              Share this with {society?.name}. Opening it brands the login for them automatically
              {isPre ? " (preschool look & wording)." : "."}
            </Text>

            {slug ? (
              <>
                <View style={styles.qrWrap}>
                  <Image source={{ uri: qrUrl }} style={styles.qr} resizeMode="contain" />
                </View>

                <Label>Web link (browser)</Label>
                <TouchableOpacity onPress={() => copy(links.web)} style={styles.linkBox}>
                  <Text style={styles.linkText} selectable>{links.web}</Text>
                  <Ionicons name="copy-outline" size={18} color="#0B6E8F" />
                </TouchableOpacity>

                <Label>App deep link (installed mobile app)</Label>
                <TouchableOpacity onPress={() => copy(links.app)} style={styles.linkBox}>
                  <Text style={styles.linkText} selectable>{links.app}</Text>
                  <Ionicons name="copy-outline" size={18} color="#0B6E8F" />
                </TouchableOpacity>

                <Text style={styles.shareHint}>
                  Note: replace the web domain in code with your hosted app URL. The QR encodes the web link.
                </Text>
              </>
            ) : (
              <Text style={styles.shareHint}>This tenant has no slug yet. Restart the server to backfill, then reopen.</Text>
            )}

            <TouchableOpacity style={[styles.modalBtn, { marginTop: 20 }]} onPress={onClose}>
              <Text style={styles.modalBtnText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Superadmin tool: set a tenant's display name + logo. These show on the Home
// screen after members log in, so each tenant reads as their own brand.
function BrandingModal({ society, onClose, onDone }) {
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const isPre = society?.orgType === "preschool";

  useEffect(() => {
    if (society) {
      setName(society.name || "");
      setLogoUrl(society.logoUrl || "");
    }
  }, [society]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("Missing info", "Enter a display name.");
      return;
    }
    setBusy(true);
    try {
      await api.superUpdateSociety(society.id, { name: name.trim(), logoUrl: logoUrl.trim() });
      Alert.alert("Branding saved", "Members will see the new name/logo the next time they open the app.");
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={!!society} onClose={onClose} title="Branding" icon="color-palette-outline" busy={busy} onSubmit={submit}>
      <Label>Display name *</Label>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={isPre ? "Little Millennium Preschool" : "Green Valley Residency"} />
      <Label>Logo URL (optional)</Label>
      <TextInput style={styles.input} value={logoUrl} onChangeText={setLogoUrl} placeholder="https://.../logo.png" autoCapitalize="none" keyboardType="url" />
      <View style={styles.brandPreview}>
        {logoUrl.trim() ? (
          <Image source={{ uri: logoUrl.trim() }} style={styles.brandPreviewLogo} resizeMode="cover" />
        ) : (
          <View style={[styles.brandPreviewLogo, styles.brandPreviewFallback]}>
            <Text style={styles.brandPreviewInitial}>{(name.trim() || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.brandPreviewName} numberOfLines={1}>{name.trim() || "Display name"}</Text>
          <Text style={styles.brandPreviewSub}>Preview of the Home header</Text>
        </View>
      </View>
      <Text style={styles.shareHint}>
        Paste a public image URL (PNG/JPG). Leave blank to show the first letter of the name as a badge.
      </Text>
    </FormModal>
  );
}

const ROLE_LABEL = { superadmin: "Owner", admin: "Admin", guard: "Guard", resident: "Resident" };

// Superadmin tool: find any user across societies and set a new password for them
// (used when someone — even a society admin — forgets their password).
function ResetPasswordModal({ visible, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setNewPassword("");
  };

  const search = async () => {
    setSearching(true);
    try {
      const r = await api.superSearchUsers(query.trim());
      setResults(r.users || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSearching(false);
    }
  };

  const doReset = async () => {
    if (!selected || !newPassword) {
      Alert.alert("Missing info", "Pick a user and enter a new password.");
      return;
    }
    setBusy(true);
    try {
      await api.superResetPassword(selected.id, newPassword);
      Alert.alert("Password reset", `New password set for ${selected.email}. Share it with them securely.`);
      reset();
      onClose();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="key-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Reset a user's password</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Label>Find user by email or name</Label>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={query}
                onChangeText={setQuery}
                placeholder="admin@society.com"
                autoCapitalize="none"
                onSubmitEditing={search}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={searching}>
                <Ionicons name="search" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {searching && <Text style={styles.muted}>Searching…</Text>}
            {!searching && results.length === 0 && !!query && (
              <Text style={styles.muted}>No users found. Try a different email or name.</Text>
            )}

            {results.map((u) => {
              const active = selected?.id === u.id;
              return (
                <TouchableOpacity key={u.id} style={[styles.userRow, active && styles.userRowActive]} onPress={() => setSelected(u)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{u.name}</Text>
                    <Text style={styles.userMeta}>{u.email}</Text>
                    <Text style={styles.userMeta}>
                      {ROLE_LABEL[u.role] || u.role}
                      {u.societyName ? ` · ${u.societyName}` : u.role === "superadmin" ? " · Platform" : ""}
                      {u.flatNo ? ` · ${u.flatNo}` : ""}
                    </Text>
                  </View>
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? "#0B6E8F" : "#B7C1C8"} />
                </TouchableOpacity>
              );
            })}

            {!!selected && (
              <>
                <Label>New password for {selected.email}</Label>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 8 chars, 1 upper, 1 lower, 1 number"
                  autoCapitalize="none"
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => { reset(); onClose(); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, (busy || !selected) && { opacity: 0.6 }]} onPress={doReset} disabled={busy || !selected}>
                <Text style={styles.modalBtnText}>{busy ? "Saving…" : "Reset password"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ icon, text }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={13} color="#0B6E8F" />
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

function CreateSocietyModal({ visible, onClose, onDone }) {
  const [f, setF] = useState({ name: "", city: "", address: "", logoUrl: "", adminName: "", adminEmail: "", adminPassword: "" });
  const [orgType, setOrgType] = useState("society");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const preschool = orgType === "preschool";

  const submit = async () => {
    if (!f.name.trim()) {
      Alert.alert("Missing info", `Enter a ${preschool ? "preschool" : "society"} name.`);
      return;
    }
    setBusy(true);
    try {
      await api.superCreateSociety({
        name: f.name.trim(),
        city: f.city.trim(),
        address: f.address.trim(),
        logoUrl: f.logoUrl.trim() || undefined,
        orgType,
        adminName: f.adminName.trim() || undefined,
        adminEmail: f.adminEmail.trim() || undefined,
        adminPassword: f.adminPassword || undefined,
      });
      Alert.alert(`${preschool ? "Preschool" : "Society"} created`, f.adminName ? "The admin can now log in." : "Add an admin from the list.");
      setF({ name: "", city: "", address: "", logoUrl: "", adminName: "", adminEmail: "", adminPassword: "" });
      setOrgType("society");
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal visible={visible} onClose={onClose} title="Onboard an organization" icon="business-outline" busy={busy} onSubmit={submit}>
      <Label>Type</Label>
      <View style={styles.typeRow}>
        <TouchableOpacity style={[styles.typeChip, !preschool && styles.typeChipActive]} onPress={() => setOrgType("society")}>
          <Ionicons name="business-outline" size={16} color={!preschool ? "#fff" : "#0B6E8F"} />
          <Text style={[styles.typeText, !preschool && { color: "#fff" }]}>Society</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.typeChip, preschool && styles.typeChipActive]} onPress={() => setOrgType("preschool")}>
          <Ionicons name="school-outline" size={16} color={preschool ? "#fff" : "#0B6E8F"} />
          <Text style={[styles.typeText, preschool && { color: "#fff" }]}>Preschool</Text>
        </TouchableOpacity>
      </View>
      <Label>{preschool ? "Preschool" : "Society"} name *</Label>
      <TextInput style={styles.input} value={f.name} onChangeText={set("name")} placeholder={preschool ? "Little Stars Preschool" : "Green Valley Residency"} />
      <Label>City</Label>
      <TextInput style={styles.input} value={f.city} onChangeText={set("city")} placeholder="Pune" />
      <Label>Address</Label>
      <TextInput style={styles.input} value={f.address} onChangeText={set("address")} placeholder="Baner Road, Pune" />
      <Label>Logo URL (optional)</Label>
      <TextInput style={styles.input} value={f.logoUrl} onChangeText={set("logoUrl")} placeholder="https://.../logo.png" autoCapitalize="none" keyboardType="url" />
      <Text style={styles.divider}>First admin (optional)</Text>
      <Label>Admin name</Label>
      <TextInput style={styles.input} value={f.adminName} onChangeText={set("adminName")} placeholder="Society Admin" />
      <Label>Admin email</Label>
      <TextInput style={styles.input} value={f.adminEmail} onChangeText={set("adminEmail")} placeholder="admin@society.com" autoCapitalize="none" keyboardType="email-address" />
      <Label>Admin password</Label>
      <TextInput style={styles.input} value={f.adminPassword} onChangeText={set("adminPassword")} placeholder="At least 8 chars, 1 letter + 1 number" secureTextEntry />
    </FormModal>
  );
}

function AddAdminModal({ society, onClose, onDone }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || !f.email.trim() || !f.password) {
      Alert.alert("Missing info", "Name, email and password are required.");
      return;
    }
    setBusy(true);
    try {
      await api.superAddAdmin(society.id, {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim() || undefined,
        password: f.password,
      });
      Alert.alert("Admin added", `${f.email.trim()} can now manage ${society.name}.`);
      setF({ name: "", email: "", phone: "", password: "" });
      onClose();
      onDone();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      visible={!!society}
      onClose={onClose}
      title={society ? `Add admin · ${society.name}` : "Add admin"}
      icon="person-add-outline"
      busy={busy}
      onSubmit={submit}
    >
      <Label>Name</Label>
      <TextInput style={styles.input} value={f.name} onChangeText={set("name")} placeholder="Admin name" />
      <Label>Email</Label>
      <TextInput style={styles.input} value={f.email} onChangeText={set("email")} placeholder="admin@society.com" autoCapitalize="none" keyboardType="email-address" />
      <Label>Phone</Label>
      <TextInput style={styles.input} value={f.phone} onChangeText={set("phone")} placeholder="Optional" keyboardType="phone-pad" />
      <Label>Password</Label>
      <TextInput style={styles.input} value={f.password} onChangeText={set("password")} placeholder="At least 8 chars, 1 letter + 1 number" secureTextEntry />
    </FormModal>
  );
}

// Set a society's subscription plan (free / premium yearly).
function EditPlanModal({ society, onClose, onDone }) {
  const [premium, setPremium] = useState(false);
  const [amount, setAmount] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [emailInvoice, setEmailInvoice] = useState(false);
  const [busy, setBusy] = useState(false);

  // Prefill whenever a new society is selected.
  React.useEffect(() => {
    if (!society) return;
    setPremium(society.premium || society.plan === "premium");
    setAmount(society.planAmount ? String(society.planAmount) : "");
    setExpires(society.planExpiresAt ? new Date(society.planExpiresAt).toISOString().slice(0, 10) : "");
    setNote("");
    setEmailInvoice(false);
  }, [society]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.superUpdateSociety(society.id, {
        plan: premium ? "premium" : "free",
        planAmount: amount === "" ? null : Number(amount),
        planExpiresAt: premium ? (expires || undefined) : null,
        planNote: note || undefined,
        sendInvoice: emailInvoice && premium,
      });
      onClose();
      onDone();
      if (res?.invoice) {
        if (res.invoice.error) Alert.alert("Invoice not sent", res.invoice.error);
        else if (res.invoice.dev) Alert.alert("Saved", "Plan updated. Email isn't configured yet, so the invoice was logged on the server (dev mode).");
        else if (res.invoice.delivered) Alert.alert("Invoice emailed", `Sent to ${res.invoice.admins} admin(s).`);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      visible={!!society}
      onClose={onClose}
      title={society ? `Plan · ${society.name}` : "Plan"}
      icon="star-outline"
      busy={busy}
      onSubmit={submit}
    >
      <TouchableOpacity style={styles.planToggle} onPress={() => setPremium((p) => !p)}>
        <View>
          <Text style={styles.planToggleTitle}>Premium plan</Text>
          <Text style={styles.planToggleSub}>Unlocks vendor marketplace, voice AI & more</Text>
        </View>
        <Ionicons name={premium ? "toggle" : "toggle-outline"} size={40} color={premium ? "#2E9E52" : "#B7C1C8"} />
      </TouchableOpacity>
      <Label>Yearly amount (₹)</Label>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="e.g. 12000" keyboardType="number-pad" />
      {premium && (
        <>
          <Label>Expires on (YYYY-MM-DD)</Label>
          <TextInput style={styles.input} value={expires} onChangeText={setExpires} placeholder="Defaults to 1 year from now" autoCapitalize="none" />
        </>
      )}
      <Label>Note (optional)</Label>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Payment ref / remarks" />
      {premium && (
        <TouchableOpacity style={styles.invoiceRow} onPress={() => setEmailInvoice((v) => !v)}>
          <Ionicons name={emailInvoice ? "checkbox" : "square-outline"} size={22} color={emailInvoice ? "#0B6E8F" : "#B7C1C8"} />
          <Text style={styles.invoiceText}>Email invoice to society admins now</Text>
        </TouchableOpacity>
      )}
    </FormModal>
  );
}

function FormModal({ visible, onClose, title, icon, children, busy, onSubmit }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <LinearGradient colors={["#0E85AC", "#0B6E8F", "#075064"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
              <Ionicons name={icon || "create-outline"} size={20} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
          </LinearGradient>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {children}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy}>
                <Text style={styles.modalBtnText}>{busy ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const Label = ({ children }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F7" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  empty: { color: "#6B7B85", textAlign: "center", marginTop: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  name: { fontSize: 17, fontWeight: "800", color: "#1B2B33" },
  city: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeOn: { backgroundColor: "#DFF3E6" },
  badgeOff: { backgroundColor: "#FBE4D5" },
  badgePremium: { backgroundColor: "#FDF0D0" },
  badgeFree: { backgroundColor: "#EEF2F4" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  planLine: { color: "#8A5A00", fontSize: 12, marginTop: 10, fontWeight: "600" },
  planToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F6F9FA", borderRadius: 12, padding: 14, marginTop: 6 },
  planToggleTitle: { fontWeight: "800", color: "#1B2B33", fontSize: 15 },
  planToggleSub: { color: "#6B7B85", fontSize: 12, marginTop: 2, maxWidth: 200 },
  invoiceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  invoiceText: { color: "#334", fontWeight: "600", flex: 1 },
  typeRow: { flexDirection: "row", gap: 10 },
  typeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#CFE0E6", borderRadius: 10, paddingVertical: 11 },
  typeChipActive: { backgroundColor: "#0B6E8F", borderColor: "#0B6E8F" },
  typeText: { color: "#0B6E8F", fontWeight: "700" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EAF4F7", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: "#0B6E8F", fontSize: 12, fontWeight: "600" },
  finRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  finBox: { flex: 1, backgroundColor: "#F6F9FA", borderRadius: 10, padding: 10 },
  finLabel: { color: "#6B7B85", fontSize: 11 },
  finVal: { fontSize: 15, fontWeight: "800", color: "#1B2B33", marginTop: 2 },
  admins: { color: "#6B7B85", fontSize: 12, marginTop: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EEF4F6", borderRadius: 10, paddingVertical: 11 },
  actionOn: { backgroundColor: "#DFF3E6" },
  actionGhostText: { color: "#0B6E8F", fontWeight: "700", fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  modalHeaderIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
  modalBody: { padding: 20, paddingTop: 16 },
  divider: { marginTop: 18, marginBottom: 2, fontSize: 13, fontWeight: "800", color: "#0B6E8F" },
  label: { fontSize: 13, fontWeight: "600", color: "#334", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: "#F8FAFB" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, backgroundColor: "#0B6E8F", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  cancelBtn: { backgroundColor: "#EEF2F4" },
  cancelText: { color: "#6B7B85", fontWeight: "700" },
  searchBtn: { width: 48, backgroundColor: "#0B6E8F", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  muted: { color: "#8895A0", fontSize: 13, marginTop: 12 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#E1E8EC", borderRadius: 10, padding: 12, marginTop: 10 },
  userRowActive: { borderColor: "#0B6E8F", backgroundColor: "#F1F8FB" },
  userName: { fontWeight: "800", color: "#1B2B33" },
  userMeta: { color: "#6B7B85", fontSize: 12, marginTop: 2 },
  shareIntro: { color: "#425059", fontSize: 14, lineHeight: 20 },
  qrWrap: { alignItems: "center", marginTop: 16, marginBottom: 4 },
  qr: { width: 200, height: 200, borderRadius: 12, backgroundColor: "#fff" },
  linkBox: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#D6DEE3", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#F8FAFB" },
  linkText: { flex: 1, color: "#0B6E8F", fontWeight: "600", fontSize: 13 },
  shareHint: { color: "#8895A0", fontSize: 12, marginTop: 12, lineHeight: 17 },
  brandPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0B6E8F",
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  brandPreviewLogo: { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.9)" },
  brandPreviewFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.22)" },
  brandPreviewInitial: { color: "#fff", fontWeight: "800", fontSize: 18 },
  brandPreviewName: { color: "#fff", fontWeight: "800", fontSize: 16 },
  brandPreviewSub: { color: "#CDE7F0", fontSize: 11, marginTop: 2 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E3EAEE",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1B2B33", outlineStyle: "none" },
});
