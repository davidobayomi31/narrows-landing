// Narrows — marina web portal shared module. No bundler: plain ES module,
// loaded via <script type="module"> and imported by each page. Talks to the
// SAME Supabase project as the app (lib/supabase.ts in narrows-app) — every
// RLS policy scoped to marinas.profile_id = auth.uid() already works here
// unchanged, since a magic-link session is a real Supabase auth session like
// any other.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://pddfyikqpuuuzgqhwjgu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_J7Zbq4Jv3AXR3lBivlEPXw_YFSzTlGh';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/marina/login.html';
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatCents(cents) {
  if (cents == null) return 'Contact for pricing';
  return `$${(cents / 100).toLocaleString('en-CA', { maximumFractionDigits: 2 })}`;
}

export function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_LABEL = {
  pending: 'Pending', approved: 'Approved', in_progress: 'In Progress',
  paid: 'Paid', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled',
};
export function statusLabel(s) { return STATUS_LABEL[s] ?? s; }
export function statusPillHtml(s) {
  return `<span class="pill pill-${s}">${statusLabel(s)}</span>`;
}

// Every page except login.html calls this on load. Redirects to login if
// there's no session; shows a plain "not a marina account" message if a
// boater account somehow lands here; otherwise resolves the signed-in
// marina owner's profile + (if approved and linked) their marinas row.
// isPending mirrors the app's MarinaRequestsScreen: account_type is
// 'marina' but no marinas row has profile_id set yet.
export async function requireMarinaSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/marina/login.html';
    return null;
  }
  const user = session.user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, first_name, last_name')
    .eq('id', user.id)
    .single();

  if (!profile) {
    // Shouldn't normally happen — login.html only allows existing accounts
    // to sign in (shouldCreateUser: false), and Ace (apply.html /
    // apply-confirm.html) always creates the profiles row before ever
    // reaching a portal page. This is the defensive fallback for a stale or
    // interrupted account (e.g. apply-confirm.html failed partway through).
    document.body.innerHTML = `
      <div class="login-wrap">
        <div class="logo">NARROWS</div>
        <h1>Not a marina account yet</h1>
        <p>We couldn't find an application for this email. Apply as a marina to get started — it only takes a few minutes.</p>
        <a href="/marina/apply.html" class="btn btn-primary" style="margin-bottom:12px;">Apply as a marina</a>
        <button class="btn btn-secondary" id="sign-out-btn">Sign out</button>
      </div>`;
    document.getElementById('sign-out-btn').addEventListener('click', signOut);
    return null;
  }
  if (profile.account_type !== 'marina') {
    document.body.innerHTML = `
      <div class="login-wrap">
        <div class="logo">NARROWS</div>
        <h1>Not a marina account</h1>
        <p>This portal is for marina partners. This email is signed up as a boater in the Narrows app — sign in here with the email you used to apply as a marina instead.</p>
        <button class="btn btn-secondary" id="sign-out-btn">Sign out</button>
      </div>`;
    document.getElementById('sign-out-btn').addEventListener('click', signOut);
    return null;
  }

  const { data: marina } = await supabase
    .from('marinas')
    .select('*')
    .eq('profile_id', user.id)
    .maybeSingle();

  return { user, profile, marina, isPending: !marina };
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: '/marina/dashboard.html' },
  { key: 'requests', label: 'Requests', href: '/marina/requests.html' },
  { key: 'messages', label: 'Messages', href: '/marina/messages.html' },
  { key: 'listings', label: 'Listings', href: '/marina/listings.html' },
  { key: 'profile', label: 'Profile', href: '/marina/profile.html' },
];

// Renders the topbar + tab nav into #portal-header, and wires the sign-out
// button. Call after requireMarinaSession() resolves so marinaName is known.
export function renderNav(active, marinaName) {
  const header = document.getElementById('portal-header');
  if (!header) return;
  header.innerHTML = `
    <div class="topbar">
      <div class="topbar-brand">
        <span class="logo">NARROWS</span>
        <span class="marina-name">${escapeHtml(marinaName || 'Marina Portal')}</span>
      </div>
      <button class="topbar-signout" id="sign-out-btn">Sign out</button>
    </div>
    <nav class="tabs">
      ${NAV_ITEMS.map((item) => `<a href="${item.href}" class="${item.key === active ? 'active' : ''}">${item.label}</a>`).join('')}
    </nav>
  `;
  document.getElementById('sign-out-btn').addEventListener('click', signOut);
}

// Shown in place of the main content on every page (dashboard, requests,
// messages, listings, profile all check isPending the same way) so the nav
// stays visible and consistent instead of bouncing a pending marina around.
export function pendingApprovalHtml() {
  return `
    <div class="card" style="text-align:center; padding: 48px 24px;">
      <h2 style="margin-bottom:10px;">Application under review</h2>
      <p style="color:var(--muted); font-size:14px; line-height:1.6; max-width:440px; margin:0 auto;">
        We manually review every marina before it goes live — this usually takes a day or two.
        We'll email you once your marina is approved and this portal unlocks.
      </p>
    </div>`;
}
