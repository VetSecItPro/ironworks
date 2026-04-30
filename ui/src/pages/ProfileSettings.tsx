import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Check, Eye, EyeOff, Globe, Keyboard, Lock, Palette, User } from "lucide-react";
import { useEffect, useState } from "react";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { Link } from "@/lib/router";
import {
  AccentColorPicker,
  CompactModeToggle,
  loadWidgetLayout,
  saveWidgetLayout,
  type WidgetConfig,
  WidgetLayoutEditor,
} from "../components/PersonalPreferences";
import { PowerModeToggle } from "../components/ProgressiveDisclosure";
import { SampleDataToggle } from "../components/SampleDataToggle";

// ---------------------------------------------------------------------------
// Timezone options (major US + international zones)
// ---------------------------------------------------------------------------

const TIMEZONE_OPTIONS = [
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
];

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

// Display name + email come from the Better Auth session (server-authoritative).
// Timezone has no DB column on the user table yet, so it stays in localStorage
// — purely client-side cosmetic preference until a schema migration lands.
const STORAGE_PREFIX = "ironworks:profile";
const tzKey = `${STORAGE_PREFIX}:timezone`;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validatePassword(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("Must be at least 8 characters");
  if (!/[A-Z]/.test(password)) issues.push("Must contain an uppercase letter");
  if (!/[a-z]/.test(password)) issues.push("Must contain a lowercase letter");
  if (!/[0-9]/.test(password)) issues.push("Must contain a number");
  return issues;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => authApi.getSession(),
    staleTime: 30_000,
  });

  const sessionUser = sessionQuery.data?.user ?? null;
  const sessionEmail = sessionUser?.email ?? "";
  const sessionName = sessionUser?.name ?? "";

  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState(() => localStorage.getItem(tzKey) ?? "America/Chicago");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Settings", href: "/company/settings" }, { label: "Profile" }]);
  }, [setBreadcrumbs]);

  // Seed the editable name field once the session resolves. Only sync from
  // server when the local edit buffer is still pristine — never clobber an
  // in-flight edit on background refetch.
  useEffect(() => {
    if (sessionUser && displayName === "") {
      setDisplayName(sessionName);
    }
  }, [sessionUser, sessionName, displayName]);

  const updateProfileMutation = useMutation({
    mutationFn: (input: { name: string }) => authApi.updateUser(input),
    onSuccess: () => {
      setProfileSaved(true);
      setProfileError(null);
      pushToast({ title: "Profile updated", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
      setTimeout(() => setProfileSaved(false), 2000);
    },
    onError: (err) => {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => authApi.changePassword(input),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordErrors([]);
      setPasswordSaved(true);
      pushToast({ title: "Password changed", tone: "success" });
      setTimeout(() => setPasswordSaved(false), 2000);
    },
    onError: (err) => {
      setPasswordErrors([err instanceof Error ? err.message : "Failed to change password"]);
    },
  });

  function handleSaveProfile() {
    if (!displayName.trim()) return;
    setProfileError(null);
    localStorage.setItem(tzKey, timezone);
    if (displayName.trim() !== sessionName) {
      updateProfileMutation.mutate({ name: displayName.trim() });
    } else {
      // Timezone-only change — nothing to persist server-side.
      setProfileSaved(true);
      pushToast({ title: "Profile updated", tone: "success" });
      setTimeout(() => setProfileSaved(false), 2000);
    }
  }

  function handleChangePassword() {
    const issues = validatePassword(newPassword);
    if (!currentPassword) {
      issues.unshift("Current password is required");
    }
    if (newPassword !== confirmPassword) {
      issues.push("Passwords do not match");
    }
    if (issues.length > 0) {
      setPasswordErrors(issues);
      return;
    }
    setPasswordErrors([]);
    changePasswordMutation.mutate({ currentPassword, newPassword });
  }

  const profileDirty =
    displayName.trim() !== sessionName || timezone !== (localStorage.getItem(tzKey) ?? "America/Chicago");

  const nameError = displayName.length > 0 && displayName.trim().length === 0 ? "Name cannot be blank" : null;

  return (
    <div className="p-6 max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <User className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight">Account & Profile</h1>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/notifications">
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            Notification Preferences
          </Link>
        </Button>
      </div>

      {/* Profile form */}
      <div className="rounded-lg border border-border p-5 space-y-5">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Profile</h2>
        </div>

        <div className="space-y-4">
          {/* Display name */}
          <div className="space-y-1.5">
            <label htmlFor="profile-display-name" className="text-sm font-medium">
              Display name
            </label>
            <input
              id="profile-display-name"
              className={`w-full rounded-md border bg-transparent px-2.5 py-1.5 text-sm outline-none ${
                nameError ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
              }`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label htmlFor="profile-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="profile-email"
              className="w-full rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm outline-none text-muted-foreground cursor-not-allowed"
              value={sessionQuery.isLoading ? "" : sessionEmail}
              placeholder={sessionQuery.isLoading ? "Loading..." : ""}
              readOnly
              tabIndex={-1}
            />
            <p className="text-xs text-muted-foreground">Email cannot be changed here. Contact your administrator.</p>
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <label htmlFor="profile-timezone" className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Timezone preference
            </label>
            <select
              id="profile-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {profileError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{profileError}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleSaveProfile}
            disabled={!displayName.trim() || !!nameError || !profileDirty || updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
          </Button>
          {profileSaved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Change password */}
      <div className="rounded-lg border border-border p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Change Password</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="profile-current-password" className="text-sm font-medium">
              Current password
            </label>
            <div className="relative">
              <input
                id="profile-current-password"
                type={showCurrent ? "text" : "password"}
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 pr-9 text-sm outline-none focus:border-primary"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showCurrent ? "Hide password" : "Show password"}
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-new-password" className="text-sm font-medium">
              New password
            </label>
            <div className="relative">
              <input
                id="profile-new-password"
                type={showNew ? "text" : "password"}
                className={`w-full rounded-md border bg-transparent px-2.5 py-1.5 pr-9 text-sm outline-none ${
                  newPassword && validatePassword(newPassword).length > 0
                    ? "border-amber-500 focus:border-amber-500"
                    : "border-border focus:border-primary"
                }`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label={showNew ? "Hide password" : "Show password"}
                onClick={() => setShowNew((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword && validatePassword(newPassword).length > 0 && (
              <div className="space-y-0.5 mt-1">
                {validatePassword(newPassword).map((issue) => (
                  <p key={issue} className="text-[11px] text-amber-600 dark:text-amber-400">
                    - {issue}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-confirm-password" className="text-sm font-medium">
              Confirm new password
            </label>
            <div className="relative">
              <input
                id="profile-confirm-password"
                type={showConfirm ? "text" : "password"}
                className={`w-full rounded-md border bg-transparent px-2.5 py-1.5 pr-9 text-sm outline-none ${
                  confirmPassword && confirmPassword !== newPassword
                    ? "border-destructive focus:border-destructive"
                    : "border-border focus:border-primary"
                }`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label={showConfirm ? "Hide password" : "Show password"}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
        </div>

        {passwordErrors.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {passwordErrors.map((err) => (
                <p key={err} className="text-xs text-destructive">
                  {err}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleChangePassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
          </Button>
          {passwordSaved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Password changed
            </span>
          )}
        </div>
      </div>

      {/* Appearance & Preferences */}
      <div className="rounded-lg border border-border p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Appearance & Preferences</h2>
        </div>

        <AccentColorPicker />

        <div className="flex items-center gap-4 flex-wrap">
          <CompactModeToggle />
          <PowerModeToggle />
          <SampleDataToggle />
        </div>
      </div>

      {/* Dashboard Layout */}
      <div className="rounded-lg border border-border p-5 space-y-5">
        <WidgetLayoutEditor
          widgets={loadWidgetLayout()}
          onChange={(widgets: WidgetConfig[]) => saveWidgetLayout(widgets)}
        />
      </div>

      {/* Keyboard shortcuts link */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium">Keyboard Shortcuts</div>
            <div className="text-xs text-muted-foreground">View and customize all keyboard shortcuts</div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/keyboard-shortcuts">View Shortcuts</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
