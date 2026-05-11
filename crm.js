    const SUPABASE_URL_CRM = "https://czuyemwqfdunedfufqso.supabase.co";
    const SUPABASE_ANON_KEY_CRM = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dXllbXdxZmR1bmVkZnVmcXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDA3MjYsImV4cCI6MjA5MjU3NjcyNn0.RmD13Vp0qAHyKFeONfjnJ4ewVDhYfMSQwy-gi-Aeads";
    const sbCrm = window.supabase.createClient(SUPABASE_URL_CRM, SUPABASE_ANON_KEY_CRM, {
      auth: {
        storage: window.localStorage,
        storageKey: "sb-crm-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    let currentUser = null;

    const stages = ["Research", "Contacted", "Engaged", "Report Sent", "Won"];
    const storageKey = "adc-crm-leads-v1";
    const aiDraftStorageKey = "adc-ai-drafts-v1";
    const GMAIL_CLIENT_ID = "384687062869-i82k1653igr34c81v2f8frhkrm7skcg6.apps.googleusercontent.com";
    const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";
    const claudeKeyStorageKey = "adc-claude-api-key";
    const cachedCrmUserKey = "adc-crm-user-v1";
    const todayIso = localDate();
    const sequence = [
      { key: "intro", action: "Send intro email", stage: "Contacted", label: "Touch 0 intro", subject: "Quick red-flag review", due: "now" },
      { key: "followup1", action: "Follow up", stage: "Engaged", label: "Touch 1 · +3 business days", subject: "Re: red-flag review", businessDays: 3 },
      { key: "followup2", action: "Follow up", stage: "Engaged", label: "Touch 2 · +3 business days", subject: "Still worth a look?", businessDays: 3 },
      { key: "weekly1", action: "Weekly follow up", stage: "Report Sent", label: "Weekly follow-up 1", subject: "Free Red Flag Report", days: 7 },
      { key: "weekly2", action: "Weekly follow up", stage: "Report Sent", label: "Weekly follow-up 2", subject: "Should I close the loop?", days: 7 },
      { key: "monthly", action: "Monthly check-in", stage: "Report Sent", label: "Monthly long-tail", subject: "Quick monthly check-in", days: 30, repeat: true }
    ];

    const starterLeads = [
      {
        id: uid(), company: "Mahaaya Hospitality", contact: "Operations Lead", email: "",
        phone: "", city: "Houston", pos: "Toast", locations: 3, value: 2500, stage: "Engaged",
        temperature: "Warm", nextAction: "Send sample report", nextDate: todayIso,
        pain: "Labor variance, invoice drift, inventory counts", notes: "Good fit for consolidated red-flag review.",
        sequenceStep: 1, touches: 1, lastTouch: addDays(-3), updatedAt: Date.now() - 200000
      },
      {
        id: uid(), company: "NineMax Media Cafe Leads", contact: "Owner", email: "",
        phone: "", city: "Dallas", pos: "Square", locations: 2, value: 1800, stage: "Research",
        temperature: "Cold", nextAction: "Research decision maker", nextDate: addDays(1),
        pain: "Delivery mix and discounts", notes: "Find owner email and recent location count.",
        sequenceStep: 0, touches: 0, lastTouch: "", updatedAt: Date.now() - 500000
      },
      {
        id: uid(), company: "Chopsticks Group", contact: "GM", email: "",
        phone: "", city: "Austin", pos: "Clover", locations: 4, value: 3200, stage: "Contacted",
        temperature: "Hot", nextAction: "Follow up", nextDate: todayIso,
        pain: "Overtime, missed breaks, waste", notes: "Mention free one-time Red Flag Report.",
        sequenceStep: 2, touches: 2, lastTouch: addDays(-4), updatedAt: Date.now() - 900000
      }
    ];

    let leads = [];
    let leadsChannel = null;
    let aiDraftsChannel = null;
    let activeView = "pipeline";
    let gmailToken = null;
    let gmailEmail = null;
    let tokenClient = null;
    let gapiReady = false;
    let gisReady = false;
    let batchLeads = [];
    let claudeApiKey = localStorage.getItem(claudeKeyStorageKey) || "";
    const aiDrafts = new Map();

    const $ = (id) => document.getElementById(id);
    const board = $("board");
    const leadRows = $("leadRows");
    const taskRows = $("taskRows");
    const stageFilter = $("stageFilter");
    const stageInput = $("stage");
    const outreachQueue = $("outreachQueue");
    const sequenceList = $("sequenceList");

    function saveAiDrafts() {
      const obj = Object.fromEntries(aiDrafts);
      localStorage.setItem(aiDraftStorageKey, JSON.stringify(obj));
    }

    function loadAiDrafts() {
      aiDrafts.clear();
    }

    async function clearAiDraft(leadId) {
      aiDrafts.delete(leadId);
      saveAiDrafts();
      if (currentUser) {
        const { error } = await sbCrm.from("ai_drafts").delete().eq("lead_id", leadId).eq("user_id", currentUser.id);
        if (error) throw error;
      }
    }

    function uid() {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function dedupeLeadIds(list) {
      const seen = new Set();
      let changed = false;
      for (const lead of list) {
        if (!lead.id || seen.has(lead.id)) {
          lead.id = uid();
          changed = true;
        }
        seen.add(lead.id);
      }
      return changed;
    }

    function loadLeads() {
      return [];
    }

    function normalizeLead(raw = {}) {
      const lead = {
        id: raw.id || uid(),
        company: raw.company || raw.Company || "",
        contact: raw.contact || raw["Primary Contact"] || raw.primaryContact || "",
        email: raw.email || raw.Email || "",
        phone: raw.phone || raw.Phone || "",
        city: raw.city || raw["City / Market"] || raw.market || "",
        state: raw.state || raw.State || "",
        website: raw.website || raw.Website || "",
        pos: raw.pos || raw.POS || "Unknown",
        locations: Number(raw.locations || raw.Locations || 1),
        source: raw.source || raw["Lead Source"] || "",
        value: Number(raw.value || raw["Estimated Monthly Value"] || raw.estimatedMonthlyValue || 0),
        stage: raw.stage || raw.Stage || "Research",
        temperature: raw.temperature || raw.Temperature || "Cold",
        nextAction: raw.nextAction || raw["Next Action"] || sequence[0].action,
        nextDate: normalizeDate(raw.nextDate || raw.nextDueAt || raw["Next Action Date"]) || todayIso,
        nextDueAt: normalizeDate(raw.nextDueAt || raw.nextDate || raw["Next Action Date"]) || todayIso,
        pain: raw.pain || raw["Likely Red Flags / Pain"] || raw.redFlags || "",
        personalization: raw.personalization || raw["Personalization Notes"] || "",
        notes: raw.notes || raw["Owner / Internal Notes"] || "",
        doNotContact: isYes(raw.doNotContact || raw["Do Not Contact?"]),
        active: raw.active ?? !isYes(raw.doNotContact || raw["Do Not Contact?"]),
        replied: isYes(raw.replied),
        bounced: isYes(raw.bounced),
        paused: isYes(raw.paused),
        sequenceStep: Number(raw.sequenceStep || 0),
        touches: Number(raw.touches || raw.touchCount || 0),
        touchCount: Number(raw.touchCount || raw.touches || 0),
        lastTouch: normalizeDate(raw.lastTouch || raw.lastSentAt) || "",
        lastSentAt: normalizeDate(raw.lastSentAt || raw.lastTouch) || "",
        lastGmailMessageId: raw.lastGmailMessageId || "",
        threadId: raw.threadId || "",
        updatedAt: Number(raw.updatedAt || Date.now())
      };
      lead.company = String(lead.company).trim();
      lead.contact = String(lead.contact).trim();
      lead.email = String(lead.email).trim();
      lead.phone = String(lead.phone).trim();
      lead.city = String(lead.city).trim();
      lead.state = String(lead.state).trim();
      lead.website = String(lead.website).trim();
      lead.source = String(lead.source).trim();
      lead.pain = String(lead.pain).trim();
      lead.personalization = String(lead.personalization).trim();
      lead.notes = String(lead.notes).trim();
      return lead;
    }

    function isYes(value) {
      return ["yes", "y", "true", "1"].includes(String(value || "").trim().toLowerCase());
    }

    function normalizeDate(value) {
      if (!value) return "";
      if (value instanceof Date) return localDate(value);
      const text = String(value).trim();
      if (!text) return "";
      if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? "" : localDate(parsed);
    }

    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
    }

    function saveLeads() {
      localStorage.setItem(storageKey, JSON.stringify(leads));
    }

    async function upsertLeadToCloud(lead) {
      if (!currentUser) return;
      const updatedAt = new Date().toISOString();
      const { error } = await sbCrm.from("leads").upsert({
        id: lead.id,
        user_id: currentUser.id,
        data: lead,
        updated_at: updatedAt
      });
      if (error) throw error;
    }

    async function upsertLeadsToCloud(changedLeads) {
      if (!currentUser || !changedLeads.length) return;
      const updatedAt = new Date().toISOString();
      const rows = changedLeads.map((lead) => ({
        id: lead.id,
        user_id: currentUser.id,
        data: lead,
        updated_at: updatedAt
      }));
      const { error } = await sbCrm.from("leads").upsert(rows);
      if (error) throw error;
    }

    async function setAndSaveAiDraft(leadId, value) {
      const draft = { ...value, generatedAt: value.generatedAt || Date.now() };
      aiDrafts.set(leadId, draft);
      saveAiDrafts();
      if (!currentUser) return;
      const { error } = await sbCrm.from("ai_drafts").upsert({
        lead_id: leadId,
        user_id: currentUser.id,
        text: draft.text,
        is_template: Boolean(draft.isTemplate),
        generated_at: new Date(draft.generatedAt).toISOString()
      });
      if (error) throw error;
    }

    function openSignInModal() {
      $("signInModal").classList.add("open");
      $("signInEmail").focus();
    }

    function closeSignInModal() {
      $("signInModal").classList.remove("open");
      $("signInEmail").value = "";
    }

    async function sendMagicLink() {
      const email = $("signInEmail").value.trim();
      if (!isValidEmail(email)) { showToast("Enter a valid email"); return; }
      const btn = $("sendMagicLinkBtn");
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending...";
      try {
        const { error } = await sbCrm.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/crm.html` }
        });
        if (error) throw error;
        closeSignInModal();
        showToast("Magic link sent. Check your email.");
      } catch (error) {
        showToast(error.message || "Could not send magic link");
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    function getAuthStorageKeys() {
      const storageKeys = ["sb-crm-auth"];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sb-") && key.includes("auth")) storageKeys.push(key);
      }
      return [...new Set(storageKeys)];
    }

    function clearLocalAuthState() {
      currentUser = null;
      localStorage.removeItem(cachedCrmUserKey);
      getAuthStorageKeys().forEach((key) => localStorage.removeItem(key));
      unsubscribeRealtime();
      leads = [];
      aiDrafts.clear();
      updateAuthUI();
      render();
    }

    async function signOut() {
      clearLocalAuthState();
      try {
        const { error } = await sbCrm.auth.signOut();
        if (error) throw error;
      } catch (error) {
        console.warn("[auth] sign out error", error.message || error);
      }
      showToast("Signed out");
    }

    function applyAuthSession(session, event = "") {
      const user = session?.user || null;
      if (user) {
        currentUser = user;
        localStorage.setItem(cachedCrmUserKey, JSON.stringify({ id: user.id, email: user.email || "" }));
      } else if (event === "SIGNED_OUT") {
        clearLocalAuthState();
      }
    }

    async function recoverStoredSession() {
      const storageKeys = getAuthStorageKeys();
      for (const key of [...new Set(storageKeys)]) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const session = parsed?.currentSession || parsed;
          if (!session?.access_token || !session?.refresh_token) continue;
          const { data, error } = await sbCrm.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          });
          if (error) {
            console.warn("[boot] stored session rejected", key, error.message);
            continue;
          }
          if (data.session?.user) {
            console.log("[boot] recovered stored session", key, data.session.user.email || data.session.user.id);
            return data.session;
          }
        } catch (error) {
          console.warn("[boot] could not inspect stored session", key, error.message);
        }
      }
      return null;
    }

    function restoreCachedAuthUI() {
      try {
        const cachedUser = JSON.parse(localStorage.getItem(cachedCrmUserKey) || "null");
        if (cachedUser?.id && !currentUser) {
          currentUser = cachedUser;
          updateAuthUI();
        }
      } catch {
        localStorage.removeItem(cachedCrmUserKey);
      }
    }

    function updateAuthUI() {
      const signedIn = Boolean(currentUser);
      const signInBtn = $("signInBtn");
      const authedBlock = $("authedBlock");
      const helloLabel = $("helloLabel");
      const banner = $("authBanner");
      if (signInBtn) signInBtn.style.setProperty("display", signedIn ? "none" : "block", "important");
      if (authedBlock) authedBlock.style.setProperty("display", signedIn ? "block" : "none", "important");
      if (helloLabel && signedIn) helloLabel.textContent = `Hello, ${currentUser.email || currentUser.id}`;
      if (helloLabel && !signedIn) helloLabel.textContent = "";
      if (banner) {
        banner.style.setProperty("display", signedIn ? "block" : "none", "important");
        banner.textContent = signedIn ? `Signed in as ${currentUser.email || currentUser.id}` : "";
      }
      ["addLeadBtn", "importFile", "sendBatchBtn", "genAllBtn", "scheduleAllBtn"].forEach((id) => {
        const el = $(id);
        if (el) el.disabled = !signedIn;
      });
    }

    function requireAuth() {
      if (currentUser) return true;
      showToast("Sign in to sync CRM changes");
      openSignInModal();
      return false;
    }

    async function loadFromCloud(skipMigration = false) {
      if (!currentUser) {
        leads = [];
        aiDrafts.clear();
        render();
        return;
      }
      const { data: leadRowsData, error: leadError } = await sbCrm
        .from("leads")
        .select("id,data,updated_at")
        .eq("user_id", currentUser.id);
      if (leadError) throw leadError;
      leads = (leadRowsData || []).map((row) => normalizeLead({ id: row.id, ...(row.data || {}) }));
      dedupeLeadIds(leads);

      const { data: draftRows, error: draftError } = await sbCrm
        .from("ai_drafts")
        .select("lead_id,text,is_template,generated_at")
        .eq("user_id", currentUser.id);
      if (draftError) throw draftError;
      aiDrafts.clear();
      (draftRows || []).forEach((row) => {
        aiDrafts.set(row.lead_id, {
          text: row.text || "",
          isTemplate: Boolean(row.is_template),
          generatedAt: row.generated_at ? Date.parse(row.generated_at) : Date.now()
        });
      });
      if (!skipMigration) await migrateLocalToCloud();
      saveLeads();
      saveAiDrafts();
    }

    async function migrateLocalToCloud() {
      if (!currentUser || localStorage.getItem("adc-cloud-migrated") === "1") return;
      try {
        const migratedLeadIds = new Set(JSON.parse(localStorage.getItem("adc-cloud-migrated-leads") || "[]"));
        const migratedDraftIds = new Set(JSON.parse(localStorage.getItem("adc-cloud-migrated-drafts") || "[]"));
        const savedLeads = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (Array.isArray(savedLeads)) {
          for (const raw of savedLeads) {
            const lead = normalizeLead(raw);
            if (!lead.id || migratedLeadIds.has(lead.id)) continue;
            await upsertLeadToCloud(lead);
            migratedLeadIds.add(lead.id);
            localStorage.setItem("adc-cloud-migrated-leads", JSON.stringify([...migratedLeadIds]));
          }
        }
        const savedDrafts = JSON.parse(localStorage.getItem(aiDraftStorageKey) || "{}");
        for (const [leadId, draft] of Object.entries(savedDrafts || {})) {
          if (migratedDraftIds.has(leadId)) continue;
          await setAndSaveAiDraft(leadId, {
            text: draft?.text || "",
            isTemplate: Boolean(draft?.isTemplate),
            generatedAt: draft?.generatedAt || Date.now()
          });
          migratedDraftIds.add(leadId);
          localStorage.setItem("adc-cloud-migrated-drafts", JSON.stringify([...migratedDraftIds]));
        }
        localStorage.setItem("adc-cloud-migrated", "1");
        await loadFromCloud(true);
        render();
      } catch {
        // Leave migration flags incomplete so the next signed-in boot can retry.
      }
    }

    function subscribeRealtime() {
      unsubscribeRealtime();
      if (!currentUser) return;
      leadsChannel = sbCrm
        .channel(`crm-leads-${currentUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${currentUser.id}` }, (payload) => {
          const row = payload.new || payload.old;
          if (!row?.id) return;
          if (payload.eventType === "DELETE") {
            leads = leads.filter((lead) => lead.id !== row.id);
          } else {
            const lead = normalizeLead({ id: row.id, ...(payload.new.data || {}) });
            const index = leads.findIndex((item) => item.id === lead.id);
            if (index >= 0) leads[index] = lead;
            else leads.unshift(lead);
          }
          saveLeads();
          render();
        })
        .subscribe();

      aiDraftsChannel = sbCrm
        .channel(`crm-ai-drafts-${currentUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "ai_drafts", filter: `user_id=eq.${currentUser.id}` }, (payload) => {
          const row = payload.new || payload.old;
          if (!row?.lead_id) return;
          if (payload.eventType === "DELETE") {
            aiDrafts.delete(row.lead_id);
          } else {
            aiDrafts.set(row.lead_id, {
              text: payload.new.text || "",
              isTemplate: Boolean(payload.new.is_template),
              generatedAt: payload.new.generated_at ? Date.parse(payload.new.generated_at) : Date.now()
            });
          }
          saveAiDrafts();
          render();
        })
        .subscribe();
    }

    function unsubscribeRealtime() {
      if (leadsChannel) sbCrm.removeChannel(leadsChannel);
      if (aiDraftsChannel) sbCrm.removeChannel(aiDraftsChannel);
      leadsChannel = null;
      aiDraftsChannel = null;
    }

    function localDate(date = new Date()) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function addDays(days) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return localDate(date);
    }

    function addBusinessDays(days, from = new Date()) {
      const date = new Date(from);
      let remaining = Number(days || 0);
      while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay();
        if (day !== 0 && day !== 6) remaining -= 1;
      }
      return localDate(date);
    }

    function nextSequenceDate(step) {
      if (step.businessDays) return addBusinessDays(step.businessDays);
      if (step.days) return addDays(step.days);
      return todayIso;
    }

    function isStopped(lead) {
      return !lead.active || lead.paused || lead.replied || lead.bounced || lead.doNotContact || lead.stage === "Won";
    }

    function statusLabel(lead) {
      if (lead.doNotContact) return "Do Not Contact";
      if (lead.bounced) return "Bounced";
      if (lead.replied) return "Replied";
      if (lead.paused || !lead.active) return "Paused";
      return "Active";
    }

    function statusValue(lead) {
      if (lead.doNotContact) return "doNotContact";
      if (lead.bounced) return "bounced";
      if (lead.replied) return "replied";
      if (lead.paused || !lead.active) return "paused";
      return "active";
    }

    function statusFlags(value) {
      return {
        active: value === "active",
        paused: value === "paused",
        replied: value === "replied",
        bounced: value === "bounced",
        doNotContact: value === "doNotContact"
      };
    }

    function money(value) {
      return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }

    function fillStageSelects() {
      const stageOptions = stages.map((stage) => `<option>${stage}</option>`).join("");
      stageInput.innerHTML = stageOptions;
      stageFilter.innerHTML = `<option value="">All stages</option>${stageOptions}`;
    }

    function filteredLeads() {
      const query = $("searchInput").value.trim().toLowerCase();
      const stage = stageFilter.value;
      const temp = $("tempFilter").value;
      const sort = $("sortSelect").value;

      return leads
        .filter((lead) => {
          const haystack = Object.values(lead).join(" ").toLowerCase();
          return (!query || haystack.includes(query)) &&
            (!stage || lead.stage === stage) &&
            (!temp || lead.temperature === temp);
        })
        .sort((a, b) => {
          if (sort === "value") return Number(b.value || 0) - Number(a.value || 0);
          if (sort === "name") return a.company.localeCompare(b.company);
          if (sort === "updated") return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
          return (a.nextDate || "9999-12-31").localeCompare(b.nextDate || "9999-12-31");
        });
    }

    function render() {
      const visible = filteredLeads();
      renderMetrics();
      renderBoard(visible);
      renderRows(visible);
      renderTasks(visible);
      renderAutomation(visible);
    }

    function renderMetrics() {
      $("metricTotal").textContent = leads.length;
      $("metricDue").textContent = leads.filter((lead) => lead.nextDate && lead.nextDate <= todayIso && lead.stage !== "Won").length;
      $("metricWarm").textContent = leads.filter((lead) => ["Hot", "Warm"].includes(lead.temperature)).length;
      $("metricValue").textContent = money(leads.reduce((sum, lead) => sum + Number(lead.value || 0), 0));
    }

    function renderBoard(visible) {
      board.innerHTML = stages.map((stage) => {
        const stageLeads = visible.filter((lead) => lead.stage === stage);
        return `
          <article class="column">
            <header>
              <h2>${stage}</h2>
              <span class="count">${stageLeads.length}</span>
            </header>
            <div class="cards">
              ${stageLeads.length ? stageLeads.map(renderCard).join("") : `<div class="empty">No leads here</div>`}
            </div>
          </article>
        `;
      }).join("");
    }

    function renderCard(lead) {
      const dueClass = lead.nextDate && lead.nextDate <= todayIso && lead.stage !== "Won" ? "due" : "";
      return `
        <article class="lead-card ${lead.temperature.toLowerCase()}">
          <div class="card-head">
            <div>
              <h3>${escapeHtml(lead.company)}</h3>
              <p>${escapeHtml(lead.contact || "No contact")} · ${escapeHtml(lead.city || "No market")}</p>
            </div>
            <span class="pill">${escapeHtml(lead.temperature)}</span>
          </div>
          <div class="pill-row">
              <span class="pill">${escapeHtml(lead.pos || "Unknown POS")}</span>
              <span class="pill">${Number(lead.locations || 1)} loc.</span>
              <span class="pill">${money(lead.value)}</span>
              <span class="pill">${escapeHtml(statusLabel(lead))}</span>
            </div>
          <p style="margin-top:10px;"><strong>Next:</strong> <span class="${dueClass}">${escapeHtml(lead.nextAction || "Set task")}</span>${lead.nextDate ? ` · ${lead.nextDate}` : ""}</p>
          <p style="margin-top:6px;">${escapeHtml(lead.pain || "No red flags noted")}</p>
          <div class="card-actions">
            <button class="mini-btn" type="button" data-edit="${lead.id}">Edit</button>
          </div>
        </article>
      `;
    }

    function renderRows(visible) {
      leadRows.innerHTML = visible.length ? visible.map((lead) => `
        <tr>
          <td><strong>${escapeHtml(lead.company)}</strong><span>${escapeHtml(lead.city || "")}</span></td>
          <td>${escapeHtml(lead.contact || "")}<br><span>${escapeHtml(lead.email || lead.phone || "")}</span></td>
          <td>${escapeHtml(lead.stage)}<br><span>${escapeHtml(lead.temperature)}</span></td>
          <td>${money(lead.value)}<br><span>${escapeHtml(lead.pain || "")}</span></td>
          <td>${escapeHtml(lead.nextAction || "")}<br><span class="${lead.nextDate <= todayIso && lead.stage !== "Won" ? "due" : ""}">${escapeHtml(lead.nextDate || "")}</span></td>
          <td><button class="mini-btn" type="button" data-edit="${lead.id}">Edit</button></td>
        </tr>
      `).join("") : `<tr><td colspan="6"><div class="empty">No matching leads</div></td></tr>`;
    }

    function renderTasks(visible) {
      const tasks = [...visible].filter((lead) => !isStopped(lead)).sort((a, b) => (a.nextDueAt || lead.nextDate || "9999").localeCompare(b.nextDueAt || b.nextDate || "9999"));
      taskRows.innerHTML = tasks.length ? tasks.map((lead) => `
        <tr>
          <td class="${(lead.nextDueAt || lead.nextDate) <= todayIso ? "due" : ""}">${escapeHtml(lead.nextDueAt || lead.nextDate || "Unscheduled")}</td>
          <td><strong>${escapeHtml(lead.company)}</strong><span>${escapeHtml(lead.contact || "")}</span></td>
          <td>${escapeHtml(lead.nextAction || "Set next action")}<br><span>${escapeHtml(lead.notes || "")}</span></td>
          <td>${escapeHtml(lead.stage)}</td>
          <td><button class="mini-btn" type="button" data-edit="${lead.id}">Edit</button></td>
        </tr>
      `).join("") : `<tr><td colspan="5"><div class="empty">No open tasks</div></td></tr>`;
    }

    function renderAutomation(visible) {
      const due = visible
        .filter((lead) => !isStopped(lead) && lead.nextDueAt && lead.nextDueAt <= todayIso)
        .sort((a, b) => (a.nextDueAt || "9999").localeCompare(b.nextDueAt || "9999"));

      outreachQueue.innerHTML = due.length ? due.map((lead) => {
        const step = sequence[Math.min(Number(lead.sequenceStep || 0), sequence.length - 1)];
        const cached = aiDrafts.get(lead.id);
        const draft = cached ? cached.text : generateDraft(lead, step.key);
        return `
          <article class="queue-card">
            <header>
              <div>
                <h3>${escapeHtml(lead.company)}</h3>
                <p>${escapeHtml(lead.contact || "No contact")} · ${escapeHtml(lead.email || "Add email before sending")} · ${escapeHtml(step.label)}</p>
              </div>
              <span class="pill">${escapeHtml(lead.temperature)}</span>
            </header>
            <div class="pill-row">
              <span class="pill">${escapeHtml(lead.nextDueAt || lead.nextDate)}</span>
              <span class="pill">${escapeHtml(lead.stage)}</span>
              <span class="pill">${Number(lead.touchCount || lead.touches || 0)} touches</span>
              ${isValidEmail(lead.email) ? "" : `<span class="pill due">Missing email</span>`}
              ${lead.paused ? `<span class="pill due">Paused</span>` : ""}
            </div>
            <div class="draft-box">${escapeHtml(draft)}</div>
            <div class="queue-actions">
              <button class="mini-btn" type="button" data-copy-outreach="${lead.id}">Copy</button>
              <button class="mini-btn" type="button" data-gen-ai-draft="${lead.id}">Generate with AI</button>
              <button class="mini-btn" type="button" data-mark-sent="${lead.id}">Mark Sent</button>
            </div>
          </article>
        `;
      }).join("") : `<div class="empty">No outreach due today. Schedule empty leads or add a next action date.</div>`;

      sequenceList.innerHTML = sequence.map((step) => `
        <div class="sequence-step">
          <b>${escapeHtml(step.label)}</b>
          <span>${escapeHtml(step.action)} · ${escapeHtml(step.subject)} · ${step.businessDays ? `${step.businessDays} business days` : step.days ? `${step.days} days` : "due now"}</span>
        </div>
      `).join("");
    }

    function generateDraft(lead, type) {
      const firstName = (lead.contact || "there").split(" ")[0];
      const personal = personalizationLine(lead.personalization, lead.company);
      const drafts = {
        intro: `Subject: quick question for ${lead.company}\n\nHi ${firstName},${personal}\n\nI'm An, and I'm working on ADC to help F&B owners make better use of the reports they already have: POS, labor, invoices, delivery, inventory, that kind of thing.\n\nRight now I'm doing the review hands-on for free while I'm getting it off the ground.\n\nIf you'd like to learn more, here's the page:\nhttps://adc-consulting.netlify.app/\n\nOr if you just want to reply with your reports, that works too.\n\nBest,\nAn`,
        followup: `Subject: Re: ${lead.company}\n\nHi ${firstName},\n\nJust following up in case my note got buried. I'm doing these report reviews hands-on right now and thought ${lead.company} might be a fit.\n\nHere's the page if useful:\nhttps://adc-consulting.netlify.app/\n\nBest,\nAn`,
        followup1: `Subject: Re: ${lead.company}\n\nHi ${firstName},\n\nJust following up in case my note got buried. I'm doing these report reviews hands-on right now and thought ${lead.company} might be a fit.\n\nHere's the page if useful:\nhttps://adc-consulting.netlify.app/\n\nBest,\nAn`,
        followup2: `Subject: still worth a look?\n\nHi ${firstName},\n\nOne more quick follow-up. If this is relevant, I'm happy to take a look at the reports you already use and send back a simple summary of what stands out.\n\nIf not, no worries at all.\n\nBest,\nAn`,
        audit: `Subject: report review for ${lead.company}\n\nHi ${firstName},\n\nI'm doing hands-on report reviews for F&B owners while getting ADC off the ground. If you send over POS, labor, invoice, delivery, or inventory reports, I'll send back a simple summary of what looks worth checking.\n\nHere's the page if you'd like more context:\nhttps://adc-consulting.netlify.app/\n\nBest,\nAn`,
        weekly1: `Subject: quick follow-up\n\nHi ${firstName},\n\nChecking back once more. I'm still doing a few hands-on report reviews for F&B owners and would be happy to include ${lead.company} if it would be useful.\n\nBest,\nAn`,
        weekly2: `Subject: should I close the loop?\n\nHi ${firstName},\n\nI do not want to crowd your inbox, so I can close the loop here. If reviewing a few existing reports would ever be useful, feel free to reply and I can take a look.\n\nBest,\nAn`,
        monthly: `Subject: quick check-in\n\nHi ${firstName},\n\nCircling back in case a hands-on report review is more useful this month. If not, no worries.\n\nBest,\nAn`,
        breakup: `Subject: should I close the loop?\n\nHi ${firstName},\n\nI do not want to crowd your inbox, so I can close the loop here. If reviewing a few existing reports would ever be useful, feel free to reply and I can take a look.\n\nBest,\nAn`
      };
      return drafts[type] || drafts.intro;
    }

    function personalizationLine(note, company) {
      const text = String(note || "").trim();
      if (!text) return "";
      const lower = text.toLowerCase();
      const blocked = ["unsure", "probably", "need to", "damn", "target client", "contact form", "would be cool", "skip breakfast"];
      if (blocked.some((term) => lower.includes(term))) return "";
      let sentence = text.split(/[.!?]\s/)[0].replace(/[.!?]+$/, "").trim();
      if (!sentence || sentence.length > 170) return "";
      sentence = sentence
        .replace(/^also does\s+/i, `${company} also does `)
        .replace(/^also\s+/i, "")
        .replace(/^first\s+founded/i, "I saw that you first founded")
        .replace(/^family also owns/i, "I noticed your family also owns")
        .replace(/^husband\s*&\s*wife duo$/i, "I saw that the business is run by a husband-and-wife team")
        .replace(/^founded by father/i, "I noticed the business was founded by your father")
        .replace(/^used to/i, "I saw that you used to");
      if (!/^I\s/i.test(sentence)) {
        const startsWithCompany = company && sentence.toLowerCase().startsWith(company.toLowerCase());
        sentence = `I noticed ${startsWithCompany ? sentence : `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`}`;
      }
      return `\n\n${sentence}.`;
    }

    function openModal(id) {
      const lead = leads.find((item) => item.id === id);
      $("modalTitle").textContent = lead ? "Edit Lead" : "Add Lead";
      $("deleteLeadBtn").style.visibility = lead ? "visible" : "hidden";
      $("leadId").value = lead?.id || "";
      $("company").value = lead?.company || "";
      $("contact").value = lead?.contact || "";
      $("email").value = lead?.email || "";
      $("phone").value = lead?.phone || "";
      $("city").value = lead?.city || "";
      $("pos").value = lead?.pos || "Unknown";
      $("locations").value = lead?.locations || 1;
      $("value").value = lead?.value || 1500;
      $("stage").value = lead?.stage || "Research";
      $("temperature").value = lead?.temperature || "Cold";
      $("leadStatus").value = lead ? statusValue(lead) : "active";
      $("nextAction").value = lead?.nextAction || "Send intro email";
      $("nextDate").value = lead?.nextDate || todayIso;
      $("pain").value = lead?.pain || "";
      $("notes").value = lead?.notes || "";
      $("leadModal").classList.add("open");
      $("company").focus();
    }

    function closeModal() {
      $("leadModal").classList.remove("open");
      $("leadForm").reset();
    }

    async function saveLead(event) {
      event.preventDefault();
      if (!requireAuth()) return;
      const id = $("leadId").value || uid();
      const existing = leads.find((item) => item.id === id);
      const flags = statusFlags($("leadStatus").value);
      const lead = {
        id,
        company: $("company").value.trim(),
        contact: $("contact").value.trim(),
        email: $("email").value.trim(),
        phone: $("phone").value.trim(),
        city: $("city").value.trim(),
        state: existing?.state || "",
        website: existing?.website || "",
        pos: $("pos").value,
        locations: Number($("locations").value || 1),
        source: existing?.source || "",
        value: Number($("value").value || 0),
        stage: $("stage").value,
        temperature: $("temperature").value,
        nextAction: $("nextAction").value,
        nextDate: $("nextDate").value,
        nextDueAt: $("nextDate").value,
        pain: $("pain").value.trim(),
        personalization: existing?.personalization || "",
        notes: $("notes").value.trim(),
        doNotContact: flags.doNotContact,
        active: flags.active,
        replied: flags.replied,
        bounced: flags.bounced,
        paused: flags.paused,
        sequenceStep: existing?.sequenceStep || 0,
        touches: existing?.touches || 0,
        touchCount: existing?.touchCount || existing?.touches || 0,
        lastTouch: existing?.lastTouch || "",
        lastSentAt: existing?.lastSentAt || existing?.lastTouch || "",
        lastGmailMessageId: existing?.lastGmailMessageId || "",
        threadId: existing?.threadId || "",
        updatedAt: Date.now()
      };

      const index = leads.findIndex((item) => item.id === id);
      if (index >= 0) leads[index] = lead;
      else leads.unshift(lead);
      saveLeads();
      try {
        await upsertLeadToCloud(lead);
        await clearAiDraft(id);
      } catch (error) {
        showToast(error.message || "Cloud save failed");
        return;
      }
      closeModal();
      render();
      showToast("Lead saved");
    }

    async function deleteLead() {
      if (!requireAuth()) return;
      const id = $("leadId").value;
      if (!id) return;
      if (!confirm("Delete this lead from the CRM?")) return;
      leads = leads.filter((lead) => lead.id !== id);
      saveLeads();
      try {
        const { error } = await sbCrm.from("leads").delete().eq("id", id).eq("user_id", currentUser.id);
        if (error) throw error;
        await clearAiDraft(id);
      } catch (error) {
        showToast(error.message || "Cloud delete failed");
        return;
      }
      closeModal();
      render();
      showToast("Lead deleted");
    }

    function exportData() {
      const blob = new Blob([JSON.stringify(leads, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `adc-crm-${todayIso}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Export ready");
    }

    function importData(event) {
      if (!requireAuth()) { event.target.value = ""; return; }
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const imported = parseLeadFile(String(reader.result || ""), file.name);
          const result = await mergeImportedLeads(imported);
          saveLeads();
          render();
          showToast(`Imported ${result.added} new, updated ${result.updated}, skipped ${result.skipped}`);
        } catch (error) {
          showToast(`Import failed: ${error.message}`);
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    }

    function parseLeadFile(text, fileName) {
      if (/\.csv$/i.test(fileName)) return parseCsv(text).map(rowToObject).map(normalizeLead);
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Expected an array");
      return parsed.map(normalizeLead);
    }

    function rowToObject(row, index, rows) {
      if (index !== 0) return row;
      return row;
    }

    function parseCsv(text) {
      const rows = [];
      let row = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];
        if (char === '"' && quoted && next === '"') {
          cell += '"';
          i += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === "," && !quoted) {
          row.push(cell);
          cell = "";
        } else if ((char === "\n" || char === "\r") && !quoted) {
          if (char === "\r" && next === "\n") i += 1;
          row.push(cell);
          if (row.some((value) => value.trim() !== "")) rows.push(row);
          row = [];
          cell = "";
        } else {
          cell += char;
        }
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      const [headers, ...data] = rows;
      if (!headers || !data.length) return [];
      return data.map((values) => headers.reduce((object, header, index) => {
        object[header.trim()] = values[index] || "";
        return object;
      }, {}));
    }

    async function mergeImportedLeads(imported) {
      if (!requireAuth()) return { added: 0, updated: 0, skipped: imported.length };
      const result = { added: 0, updated: 0, skipped: 0 };
      const seen = new Set();
      const changed = [];
      for (const lead of imported) {
        const key = lead.email ? `email:${lead.email.toLowerCase()}` : `company:${lead.company.toLowerCase()}`;
        if (!lead.company || lead.doNotContact || seen.has(key)) {
          result.skipped += 1;
          continue;
        }
        seen.add(key);
        const existingIndex = leads.findIndex((item) => {
          if (lead.email && item.email) return item.email.toLowerCase() === lead.email.toLowerCase();
          return item.company.toLowerCase() === lead.company.toLowerCase();
        });
        if (existingIndex >= 0) {
          leads[existingIndex] = { ...leads[existingIndex], ...lead, id: leads[existingIndex].id, updatedAt: Date.now() };
          changed.push(leads[existingIndex]);
          result.updated += 1;
        } else {
          const next = { ...lead, id: uid(), updatedAt: Date.now() };
          leads.unshift(next);
          changed.push(next);
          result.added += 1;
        }
      }
      await upsertLeadsToCloud(changed);
      return result;
    }

    async function copyOutreach(id) {
      const lead = leads.find((item) => item.id === id);
      if (!lead) return;
      const step = sequence[Math.min(Number(lead.sequenceStep || 0), sequence.length - 1)];
      const cached = aiDrafts.get(id);
      const text = cached ? cached.text : generateDraft(lead, step.key);
      await writeText(text);
      showToast("Outreach draft copied");
    }

    function applyMarkSentInMemory(lead) {
      if (!isValidEmail(lead.email)) return null;
      const currentStep = Math.min(Number(lead.sequenceStep || 0), sequence.length - 1);
      const current = sequence[currentStep];
      const nextStep = current.repeat ? currentStep : Math.min(currentStep + 1, sequence.length - 1);
      const next = sequence[nextStep];
      const dueDate = nextSequenceDate(next);
      return {
        ...lead,
        active: true,
        stage: current.stage,
        nextAction: next.action,
        nextDate: dueDate,
        nextDueAt: dueDate,
        sequenceStep: nextStep,
        touches: Number(lead.touches || lead.touchCount || 0) + 1,
        touchCount: Number(lead.touchCount || lead.touches || 0) + 1,
        lastTouch: todayIso,
        lastSentAt: todayIso,
        notes: `${lead.notes || ""}${lead.notes ? "\n" : ""}${todayIso}: ${current.action} marked sent. Next due ${dueDate}.`.trim(),
        updatedAt: Date.now()
      };
    }

    async function markSent(id, { silent = false } = {}) {
      if (!requireAuth()) return;
      const index = leads.findIndex((lead) => lead.id === id);
      if (index < 0) return;
      const lead = leads[index];
      const nextLead = applyMarkSentInMemory(lead);
      if (!nextLead) {
        if (!silent) { showToast("Add a valid email before marking sent"); openModal(id); }
        return;
      }
      leads[index] = nextLead;
      saveLeads();
      try {
        await upsertLeadToCloud(nextLead);
        await clearAiDraft(id);
      } catch (error) {
        showToast(error.message || "Cloud update failed");
        return;
      }
      render();
      if (!silent) showToast("Touch logged and next follow-up scheduled");
    }

    async function scheduleEmptyLeads() {
      if (!requireAuth()) return;
      const changed = [];
      leads = leads.map((lead) => {
        if (isStopped(lead) || lead.nextDueAt || lead.nextDate) return lead;
        const next = {
          ...lead,
          active: true,
          nextAction: sequence[0].action,
          nextDate: todayIso,
          nextDueAt: todayIso,
          sequenceStep: lead.sequenceStep || 0,
          updatedAt: Date.now()
        };
        changed.push(next);
        return next;
      });
      saveLeads();
      try {
        await upsertLeadsToCloud(changed);
      } catch (error) {
        showToast(error.message || "Cloud schedule failed");
        return;
      }
      render();
      showToast("Unscheduled leads added to today");
    }

    async function writeText(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const scratch = document.createElement("textarea");
        scratch.value = text;
        scratch.style.position = "fixed";
        scratch.style.left = "-9999px";
        document.body.appendChild(scratch);
        scratch.select();
        document.execCommand("copy");
        scratch.remove();
      }
    }

    function showToast(message) {
      const toast = $("toast");
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
      }[char]));
    }

    // ── Claude AI draft helpers ────────────────────────────────────

    const CLAUDE_SYSTEM_PROMPT = `You are An Pham, a founder building ADC Consulting. You are early. You email independent restaurant and cafe owners directly to ask if they want to try what you are working on. You are NOT a sales person. You are a builder reaching out because you want feedback and real reports to learn from. Frame the email so the recipient feels like trying it would be a favor TO YOU as much as it is useful to them. What you do: someone sends you their existing POS, labor, and invoice reports. You go through them and send back a short note flagging what is actually costing them money. Free right now because you are just starting out. Voice: casual, punchy, direct. Contractions and slang are fine, including coz instead of because. One exclamation point per email is fine. Do not be polished or corporate. STRUCTURE for cold intro emails (intro, audit): 1. Open with the greeting target (provided in the user message) followed by an exclamation point on its own line. The greeting target is normally the lead's first name (e.g., "Yenvy!"), but when no contact name was captured the user message will provide the business name instead — use it as-is. 2. ONE sentence with a specific personalization observation. Examples of openings: Saw your..., Noticed your..., Came across your.... 3. ONE sentence on what you are building. Mention POS, labor, and invoice reports, and frame the value as flags what is actually costing you money or similar direct phrasing. 4. ONE short sentence about it being free plus early stage. Example: Running it hands-on for free right now coz I am just starting out! 5. Soft CTA line: Worth a look? or similar single short line. 6. Link on its own line: https://adc-consulting.netlify.app/ 7. Sign off with these two lines exactly: Would love your feedback, An Pham. STRUCTURE for follow-ups (followup, followup1, followup2, weekly1, weekly2, monthly, breakup): Open with [FirstName]! or Hey [FirstName], (vary it). Reference the prior reach-out briefly without repeating the full pitch. 2 to 4 sentences total before the link and sign-off. Same link and sign-off as cold intros. Tone stays casual, low-pressure. HARD RULES (any violation equals bad email): NEVER use em dashes or en dashes. If you need a pause, use a comma, period, or new paragraph. Em dashes are aggressively banned. DO NOT explain their business back to them. Never write sentences like Running a N-location restaurant means... or Between the floor and the kitchen... or list generic restaurant problems they probably have. 60 to 110 words for cold intros. 40 to 80 words for follow-ups. Including the signature. BANNED words: data, metrics, analytics, insights, audit, leak, silos, patterns, dashboard, optimize, leverage, stack, platform, anomaly, KPI, framework, hands-on review, slipping, money you are leaving on the table. Do NOT make claims about what is not included (no calls, no contracts, etc). PERSONALIZATION: For cold intros, the personalization observation is mandatory and goes in the first sentence after the name greeting. If personalization notes are sparse or missing, open with whatever specific detail you have (city, business name, location count, type of cuisine). Never invent personalization details. LINK: https://adc-consulting.netlify.app/ SUBJECT LINE: under 7 words, lowercase, feels personal and observational. Examples of vibe: your seattle coffee spots, noticed your tucson place, thought of your group. Avoid quick question, free, help, checking in. OUTPUT FORMAT: Subject: [subject line] [email body with the link on its own line and the sign-off at the end] EXAMPLE (a cold intro, match this voice and structure closely): Subject: your seattle coffee spots Yenvy! Saw you and your sister coffee shop and then found out your family has multiple F&B spots in Seattle, so I had to reach out. I am building a tool that takes your existing POS, labor, and invoice reports and flags what is actually costing you money. Running it hands-on for free right now coz I am just starting out! Worth a look? https://adc-consulting.netlify.app/ Would love your feedback, An Pham`;

    function buildAIUserPrompt(lead, sequenceKey) {
      const rawContact = (lead.contact || "").trim();
      const contactIsValid = rawContact && !/^n\/?a$/i.test(rawContact);
      const greetingName = contactIsValid ? rawContact.split(" ")[0] : (lead.company || "there");
      const co = lead.company || "your spot";
      const city = lead.city ? ` in ${lead.city}` : "";
      const pos = lead.pos && lead.pos !== "Unknown" ? ` (uses ${lead.pos})` : "";
      const locs = Number(lead.locations || 1);
      const personal = String(lead.personalization || "").trim();
      const pain = String(lead.pain || "").trim();
      const blocked = ["unsure", "probably", "need to", "damn", "target client", "contact form", "would be cool", "skip breakfast"];
      const usePersonal = Boolean(personal) && !blocked.some((term) => personal.toLowerCase().includes(term)) && personal.length <= 240;
      const baseFacts = [
        `Greeting target (use this exactly as the opener with '!' after it): ${greetingName}`,
        contactIsValid ? "" : "(No contact name was provided — using business name as greeting target.)",
        `Company: ${co}`,
        `Locations: ${locs}${city}${pos}`,
        usePersonal
          ? `Personalization: ${personal}`
          : "Personalization: no usable specific personalization notes. Use only known company, city, location count, or cuisine/type details. Never invent details.",
        pain ? `Pain/context: ${pain}` : "",
      ].filter(Boolean).join("\n");
      const prior = lead.lastSentBody ? `\n\nPrior email:\n${lead.lastSentBody}` : "";
      const prompts = {
        intro: `Write a cold intro email. Follow the cold intro structure exactly from the system prompt.\n\nLead facts:\n${baseFacts}`,
        audit: `Write a cold intro email for the report review offer. Follow the cold intro structure exactly from the system prompt.\n\nLead facts:\n${baseFacts}`,
        followup: `Write a first follow-up. Reference the prior reach-out briefly without repeating the full pitch.\n\nLead facts:\n${baseFacts}${prior}`,
        followup1: `Write a first follow-up. Reference the prior reach-out briefly without repeating the full pitch.\n\nLead facts:\n${baseFacts}${prior}`,
        followup2: `Write a second follow-up. Keep it very short, casual, and low-pressure.\n\nLead facts:\n${baseFacts}${prior}`,
        weekly1: `Write a weekly follow-up. Keep it casual, short, and easy to reply to.\n\nLead facts:\n${baseFacts}${prior}`,
        weekly2: `Write a second weekly follow-up. Keep it casual, short, and easy to reply to.\n\nLead facts:\n${baseFacts}${prior}`,
        monthly: `Write a monthly long-tail follow-up. Keep it brief and low-pressure.\n\nLead facts:\n${baseFacts}${prior}`,
        breakup: `Write a final closing-the-loop follow-up. Leave the door open without pressure.\n\nLead facts:\n${baseFacts}${prior}`,
      };
      return prompts[sequenceKey] || prompts.intro;
    }
    async function generateAIDraft(lead, sequenceKey) {
      if (!claudeApiKey) return { text: generateDraft(lead, sequenceKey), isTemplate: true };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "x-api-key": claudeApiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 600,
            system: CLAUDE_SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildAIUserPrompt(lead, sequenceKey) }]
          })
        });
        clearTimeout(timer);
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          const code = resp.status;
          if (code === 401) showToast("Invalid API key — check Settings");
          else if (code === 429) showToast("Claude rate limit — using template fallback");
          else showToast("Claude API error — using template fallback");
          return { text: generateDraft(lead, sequenceKey), isTemplate: true };
        }
        const data = await resp.json();
        const text = data.content?.[0]?.type === "text" ? data.content[0].text.trim() : "";
        if (!text || !/^subject:/i.test(text)) {
          return { text: generateDraft(lead, sequenceKey), isTemplate: true };
        }
        const cleaned = text.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/[ \t]+/g, ' ');
        return { text: cleaned, isTemplate: false };
      } catch {
        clearTimeout(timer);
        return { text: generateDraft(lead, sequenceKey), isTemplate: true };
      }
    }

    async function generateAllDueDrafts() {
      if (!requireAuth()) return;
      if (!claudeApiKey) { showToast("Add your Anthropic API key in Settings"); return; }
      const due = leads.filter((l) => !isStopped(l) && l.nextDueAt && l.nextDueAt <= todayIso && isValidEmail(l.email));
      if (!due.length) { showToast("No due leads with valid emails"); return; }
      const btn = document.getElementById("genAllBtn");
      const originalText = btn ? btn.textContent : "";
      if (btn) btn.disabled = true;
      let generated = 0;
      let skipped = 0;
      for (let i = 0; i < due.length; i++) {
        const l = due[i];
        if (btn) btn.textContent = `Generating ${i + 1}/${due.length}…`;
        const existing = aiDrafts.get(l.id);
        if (existing && !existing.isTemplate) { skipped++; continue; }
        const step = sequence[Math.min(Number(l.sequenceStep || 0), sequence.length - 1)];
        const result = await generateAIDraft(l, step.key);
        await setAndSaveAiDraft(l.id, { ...result, generatedAt: Date.now() });
        generated++;
        await wait(100);
      }
      if (btn) { btn.disabled = false; btn.textContent = originalText || "Generate AI Drafts"; }
      render();
      showToast(`Generated ${generated}${skipped ? `, ${skipped} already cached` : ""}`);
    }

    async function generateQueueAIDraft(id, button) {
      if (!requireAuth()) return;
      const lead = leads.find((item) => item.id === id);
      if (!lead) return;
      const step = sequence[Math.min(Number(lead.sequenceStep || 0), sequence.length - 1)];
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Generating...";
      const result = await generateAIDraft(lead, step.key);
      const cached = { ...result, generatedAt: Date.now() };
      await setAndSaveAiDraft(lead.id, cached);
      const draftBox = button.closest(".queue-card")?.querySelector(".draft-box");
      if (draftBox) draftBox.textContent = cached.text;
      button.disabled = false;
      button.textContent = originalText;
      showToast(cached.isTemplate ? "Template draft ready" : "AI draft ready");
    }

    function openSettingsModal() {
      $("apiKeyInput").value = "";
      $("apiKeyHint").textContent = claudeApiKey ? `Saved key: ••••••••${claudeApiKey.slice(-4)}` : "No key saved";
      $("settingsModal").classList.add("open");
      $("apiKeyInput").focus();
    }

    function closeSettingsModal() {
      $("settingsModal").classList.remove("open");
      $("apiKeyInput").value = "";
    }

    function saveApiKey() {
      const val = $("apiKeyInput").value.trim();
      if (!val) { showToast("Paste your API key first"); return; }
      claudeApiKey = val;
      localStorage.setItem(claudeKeyStorageKey, val);
      closeSettingsModal();
      showToast("API key saved");
    }

    function clearApiKey() {
      claudeApiKey = "";
      localStorage.removeItem(claudeKeyStorageKey);
      $("apiKeyHint").textContent = "No key saved";
      $("apiKeyInput").value = "";
      showToast("API key cleared");
    }

    // ── Gmail helpers ──────────────────────────────────────────────

    function toGmailDate(isoString) {
      if (!isoString) return "";
      return String(isoString).slice(0, 10).replace(/-/g, "/");
    }

    function base64url(str) {
      return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    function buildGmailRaw(lead, draftText) {
      const [subjectLine, ...bodyLines] = draftText.split("\n");
      let subject = subjectLine.replace("Subject: ", "");
      if (lead.threadId && !/^re:/i.test(subject)) {
        subject = `re: ${subject}`;
      }
      const body = bodyLines.join("\n").trim();
      const headers = [
        `To: ${lead.email}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`,
      ];
      if (lead.threadId) {
        headers.push(`In-Reply-To: ${lead.threadId}`);
        headers.push(`References: ${lead.threadId}`);
      }
      return base64url(headers.join("\r\n") + "\r\n\r\n" + body);
    }

    async function gmailRequest(fn) {
      try {
        return await fn();
      } catch (err) {
        const status = err?.result?.error?.code || err?.status;
        if (status === 401) {
          await new Promise((resolve) => {
            tokenClient.callback = (t) => { if (t.access_token) { gmailToken = t.access_token; gapi.client.setToken({ access_token: gmailToken }); resolve(); } };
            tokenClient.requestAccessToken({ prompt: "" });
          });
          return await fn();
        }
        if (status === 403) { showToast("Gmail permission denied — reconnect"); throw err; }
        if (status === 429) { showToast("Gmail rate limit — try again in a moment"); throw err; }
        throw err;
      }
    }

    async function gmailSearch(query) {
      const results = [];
      let pageToken = null;
      do {
        const resp = await gmailRequest(() =>
          gapi.client.gmail.users.messages.list({ userId: "me", q: query, maxResults: 50, ...(pageToken && { pageToken }) })
        );
        (resp.result.messages || []).forEach((m) => results.push(m));
        pageToken = resp.result.nextPageToken || null;
      } while (pageToken);
      return results;
    }

    function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

    async function checkRepliesAndBounces() {
      const active = leads.filter((l) => !isStopped(l) && isValidEmail(l.email) && l.lastSentAt);
      if (!active.length) return 0;
      let updated = 0;
      const changed = [];
      for (const lead of active) {
        const afterDate = toGmailDate(lead.lastSentAt);
        try {
          const replyHits = await gmailSearch(`from:(${lead.email}) after:${afterDate} in:inbox`);
          if (replyHits.length) {
            let snippet = "";
            try {
              const msg = await gmailRequest(() => gapi.client.gmail.users.messages.get({ userId: "me", id: replyHits[0].id, format: "metadata" }));
              snippet = msg.result.snippet || "";
            } catch { /* non-critical */ }
            const idx = leads.findIndex((x) => x.id === lead.id);
            if (idx >= 0) {
              const oooPattern = /out of office|out of the office|on vacation|automatic reply|auto-reply|auto reply|auto response|auto-response|currently away|currently out/i;
              if (oooPattern.test(snippet)) {
                const existingNotes = leads[idx].notes || "";
                leads[idx] = {
                  ...leads[idx],
                  paused: true,
                  pausedReason: "Out of office auto-reply detected",
                  repliedAt: undefined,
                  replied: false,
                  replyMessageId: replyHits[0].id,
                  replySnippet: snippet,
                  notes: `${existingNotes}${existingNotes ? "\n" : ""}${todayIso}: OOO auto-reply detected, paused until manually resumed.`,
                  updatedAt: Date.now()
                };
              } else {
                leads[idx] = { ...leads[idx], replied: true, active: false, replyMessageId: replyHits[0].id, repliedAt: todayIso, replySnippet: snippet, updatedAt: Date.now() };
              }
              changed.push(leads[idx]);
              updated++;
            }
            await wait(200);
            continue;
          }
          const bounceHits = await gmailSearch(`(from:mailer-daemon OR from:postmaster) after:${afterDate} "${lead.email}"`);
          if (bounceHits.length) {
            const idx = leads.findIndex((x) => x.id === lead.id);
            if (idx >= 0) {
              leads[idx] = { ...leads[idx], bounced: true, active: false, bounceMessageId: bounceHits[0].id, bouncedAt: todayIso, updatedAt: Date.now() };
              changed.push(leads[idx]);
              updated++;
            }
          }
        } catch (err) {
          const code = err?.result?.error?.code;
          if (code === 403 || code === 429) break;
        }
        await wait(200);
      }
      if (updated) {
        saveLeads();
        await upsertLeadsToCloud(changed);
        render();
      }
      return updated;
    }

    async function openBatchModal() {
      if (!requireAuth()) return;
      if (!gmailToken) { showToast("Connect Gmail first"); return; }
      const body = $("batchModalBody");
      const confirmBtn = $("confirmSendBtn");
      confirmBtn.disabled = true;
      $("batchModal").classList.add("open");
      body.innerHTML = `<div class="check-progress">Checking Gmail for replies and bounces…</div>`;
      const updated = await checkRepliesAndBounces();
      const due = leads.filter((l) => !isStopped(l) && l.nextDueAt && l.nextDueAt <= todayIso && isValidEmail(l.email));
      const missing = leads.filter((l) => !isStopped(l) && l.nextDueAt && l.nextDueAt <= todayIso && !isValidEmail(l.email));
      batchLeads = due;
      if (!due.length) {
        body.innerHTML = `<div class="empty">${updated ? `${updated} lead(s) updated from Gmail. ` : ""}No sendable leads due today — add email addresses or adjust next action dates.</div>`;
        return;
      }
      if (claudeApiKey) {
        body.innerHTML = `<div class="check-progress">Generating AI drafts... (${due.length} email${due.length === 1 ? "" : "s"})</div>`;
        for (const l of due) {
          const existing = aiDrafts.get(l.id);
          if (existing && !existing.isTemplate) continue;
          const step = sequence[Math.min(Number(l.sequenceStep || 0), sequence.length - 1)];
          const result = await generateAIDraft(l, step.key);
          await setAndSaveAiDraft(l.id, { ...result, generatedAt: Date.now() });
          await wait(100);
        }
      }
      const rows = due.map((l) => {
        const step = sequence[Math.min(Number(l.sequenceStep || 0), sequence.length - 1)];
        const cached = aiDrafts.get(l.id);
        const draftText = cached ? cached.text : generateDraft(l, step.key);
        const isTemplate = cached ? cached.isTemplate : true;
        const subject = draftText.split("\n")[0].replace(/^subject:\s*/i, "");
        const badge = isTemplate ? `<span class="badge">Template</span>` : `<span class="badge" style="background:#e8f4ec;color:var(--green)">AI</span>`;
        return `<tr data-lead-id="${l.id}">
          <td><strong>${escapeHtml(l.company)}</strong></td>
          <td>${escapeHtml(l.email)}</td>
          <td>${escapeHtml(subject)}${badge}</td>
          <td>${escapeHtml(step.label)}</td>
          <td><button class="mini-btn" type="button" onclick="toggleDraftPreview('${l.id}')">Preview</button></td>
        </tr>
        <tr class="draft-preview-row" id="preview-${l.id}" style="display:none">
          <td colspan="5"><textarea id="draft-text-${l.id}">${escapeHtml(draftText)}</textarea></td>
        </tr>`;
      }).join("");
      const missingNote = missing.length ? `<p style="margin:12px 0 0;color:var(--muted);font-size:12px;">${missing.length} lead(s) skipped — missing email.</p>` : "";
      const updateNote = updated ? `<p style="margin:0 0 12px;color:var(--green);font-size:12px;">${updated} lead(s) updated from Gmail (replies or bounces detected).</p>` : "";
      body.innerHTML = `${updateNote}<div class="table-wrap"><table class="batch-table"><thead><tr><th>Company</th><th>Email</th><th>Subject</th><th>Step</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${missingNote}`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = `Confirm & Send ${due.length} email${due.length === 1 ? "" : "s"}`;
    }

    async function executeBatch() {
      if (!requireAuth()) return;
      const confirmBtn = $("confirmSendBtn");
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Sending…";
      let sent = 0;
      let failed = 0;
      const sentLeadIds = [];
      for (const lead of batchLeads) {
        const step = sequence[Math.min(Number(lead.sequenceStep || 0), sequence.length - 1)];
        const cachedDraft = aiDrafts.get(lead.id);
        const editedText = $(`draft-text-${lead.id}`)?.value || "";
        const draft = editedText || (cachedDraft ? cachedDraft.text : generateDraft(lead, step.key));
        const raw = buildGmailRaw(lead, draft);
        try {
          const threadParam = lead.threadId ? { threadId: lead.threadId } : {};
          const resp = await gmailRequest(() =>
            gapi.client.gmail.users.messages.send({ userId: "me", resource: { raw, ...threadParam } })
          );
          const idx = leads.findIndex((x) => x.id === lead.id);
          if (idx >= 0) {
            const composed = {
              ...leads[idx],
              lastSentBody: draft,
              lastGmailMessageId: resp.result.id,
              threadId: resp.result.threadId || leads[idx].threadId,
              updatedAt: Date.now()
            };
            const nextLead = applyMarkSentInMemory(composed);
            if (nextLead) {
              leads[idx] = nextLead;
              await upsertLeadToCloud(nextLead);
              sentLeadIds.push(lead.id);
            }
          }
          sent++;
        } catch {
          failed++;
        }
        await wait(300);
      }
      try {
        if (sentLeadIds.length) {
          const { error } = await sbCrm.from("ai_drafts").delete().eq("user_id", currentUser.id).in("lead_id", sentLeadIds);
          if (error) throw error;
          sentLeadIds.forEach((id) => aiDrafts.delete(id));
          saveAiDrafts();
        }
      } catch (error) {
        showToast(error.message || "Cloud batch update failed");
      }
      closeBatchModal();
      saveLeads();
      render();
      showToast(`Sent ${sent}${failed ? `, ${failed} failed — check console` : ""}`);
    }

    function closeBatchModal() {
      $("batchModal").classList.remove("open");
      batchLeads = [];
    }

    function toggleDraftPreview(leadId) {
      const row = $(`preview-${leadId}`);
      if (!row) return;
      row.style.display = row.style.display === "none" ? "table-row" : "none";
    }

    function initGmailAuth() {
      if (typeof google === "undefined" || !google.accounts) return;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GMAIL_CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (tokenResponse) => {
          if (tokenResponse.error) { showToast("Gmail sign-in cancelled"); return; }
          gmailToken = tokenResponse.access_token;
          if (gapiReady) gapi.client.setToken({ access_token: gmailToken });
          try {
            const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${gmailToken}` }
            }).then((r) => r.json());
            gmailEmail = info.email || "";
          } catch { gmailEmail = ""; }
          updateGmailBar();
          showToast(`Gmail connected${gmailEmail ? `: ${gmailEmail}` : ""}`);
        }
      });
      gisReady = true;
      updateGmailBar();
    }

    function loadGmailClient() {
      gapi.load("client", async () => {
        await gapi.client.init({});
        await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest");
        gapiReady = true;
        if (gmailToken) gapi.client.setToken({ access_token: gmailToken });
      });
    }

    function updateGmailBar() {
      const bar = $("gmailBar");
      const status = $("gmailStatus");
      const btn = $("gmailConnectBtn");
      if (!bar) return;
      if (gmailToken && gmailEmail) {
        bar.classList.add("gmail-connected");
        status.className = "gmail-email";
        status.textContent = gmailEmail;
        btn.textContent = "Disconnect";
      } else {
        bar.classList.remove("gmail-connected");
        status.className = "";
        status.textContent = "Gmail not connected";
        btn.textContent = "Connect Gmail";
      }
    }

    function handleGmailConnect() {
      if (gmailToken) {
        gmailToken = null;
        gmailEmail = null;
        if (typeof gapi !== "undefined" && gapi.client) gapi.client.setToken(null);
        updateGmailBar();
        showToast("Gmail disconnected");
        return;
      }
      if (!gisReady || !gapiReady) { showToast("Google libraries still loading — try again in a moment"); return; }
      tokenClient.requestAccessToken({ prompt: "" });
    }

    document.addEventListener("click", (event) => {
      const editId = event.target.closest("[data-edit]")?.dataset.edit;
      const copyOutreachId = event.target.closest("[data-copy-outreach]")?.dataset.copyOutreach;
      const genAiDraftBtn = event.target.closest("[data-gen-ai-draft]");
      const markSentId = event.target.closest("[data-mark-sent]")?.dataset.markSent;
      if (editId) openModal(editId);
      if (copyOutreachId) copyOutreach(copyOutreachId);
      if (genAiDraftBtn) generateQueueAIDraft(genAiDraftBtn.dataset.genAiDraft, genAiDraftBtn);
      if (markSentId) markSent(markSentId);
    });

    document.querySelectorAll(".nav button").forEach((button) => {
      button.addEventListener("click", () => {
        activeView = button.dataset.view;
        document.querySelectorAll(".nav button").forEach((item) => item.classList.toggle("active", item === button));
        document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === activeView));
      });
    });

    ["searchInput", "stageFilter", "tempFilter", "sortSelect"].forEach((id) => $(id).addEventListener("input", render));
    $("addLeadBtn").addEventListener("click", () => openModal());
    $("closeModalBtn").addEventListener("click", closeModal);
    $("cancelBtn").addEventListener("click", closeModal);
    $("leadModal").addEventListener("click", (event) => { if (event.target.id === "leadModal") closeModal(); });
    $("leadForm").addEventListener("submit", saveLead);
    $("deleteLeadBtn").addEventListener("click", deleteLead);
    $("exportBtn").addEventListener("click", exportData);
    $("importFile").addEventListener("change", importData);
    $("scheduleAllBtn").addEventListener("click", scheduleEmptyLeads);
    $("openSettingsBtn").addEventListener("click", openSettingsModal);
    $("closeSettingsModalBtn").addEventListener("click", closeSettingsModal);
    $("cancelSettingsBtn").addEventListener("click", closeSettingsModal);
    $("settingsModal").addEventListener("click", (event) => { if (event.target.id === "settingsModal") closeSettingsModal(); });
    $("saveApiKeyBtn").addEventListener("click", saveApiKey);
    $("clearApiKeyBtn").addEventListener("click", clearApiKey);
    $("gmailConnectBtn").addEventListener("click", handleGmailConnect);
    $("genAllBtn").addEventListener("click", generateAllDueDrafts);
    $("sendBatchBtn").addEventListener("click", openBatchModal);
    $("closeBatchModalBtn").addEventListener("click", closeBatchModal);
    $("cancelBatchBtn").addEventListener("click", closeBatchModal);
    $("batchModal").addEventListener("click", (event) => { if (event.target.id === "batchModal") closeBatchModal(); });
    $("confirmSendBtn").addEventListener("click", executeBatch);
    $("signInBtn").addEventListener("click", openSignInModal);
    $("signOutBtn").addEventListener("click", signOut);
    $("closeSignInBtn").addEventListener("click", closeSignInModal);
    $("cancelSignInBtn").addEventListener("click", closeSignInModal);
    $("signInModal").addEventListener("click", (event) => { if (event.target.id === "signInModal") closeSignInModal(); });
    $("sendMagicLinkBtn").addEventListener("click", sendMagicLink);

    async function boot() {
      fillStageSelects();
      restoreCachedAuthUI();
      sbCrm.auth.onAuthStateChange(async (event, session) => {
        const wasSignedIn = Boolean(currentUser);
        applyAuthSession(session, event);
        console.log("[auth]", event, currentUser?.email || "(no user)");
        updateAuthUI();
        if (currentUser) {
          try {
            await loadFromCloud();
            subscribeRealtime();
            closeSignInModal();
            if (event === "SIGNED_IN" && !wasSignedIn) {
              showToast(`Signed in as ${currentUser.email}`);
            }
          } catch (error) {
            console.error("[auth] load error", error);
            showToast(error.message || "Could not load cloud CRM");
          }
        } else {
          unsubscribeRealtime();
          leads = [];
          aiDrafts.clear();
          if (event === "SIGNED_OUT" && wasSignedIn) showToast("Signed out");
        }
        updateAuthUI();
        render();
      });
      if (typeof window !== 'undefined' && window.location.hash.includes('error_code=')) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const errCode = params.get('error_code');
        const errDesc = params.get('error_description');
        console.warn('[boot] auth error in URL:', errCode, errDesc);
        showToast(`Sign-in failed: ${errDesc || errCode}`);
        history.replaceState(null, '', window.location.pathname);
      }
      const { data } = await sbCrm.auth.getSession();
      let bootSession = data.session || null;
      console.log('[boot] session:', bootSession?.user?.email || 'none', '| hash had access_token:', window.location.hash.includes('access_token='));
      if (!bootSession) bootSession = await recoverStoredSession();
      applyAuthSession(bootSession, "BOOT_SESSION");
      console.log('[boot] resolved user:', currentUser?.email || currentUser?.id || 'none');
      updateAuthUI();
      if (currentUser) {
        try {
          await loadFromCloud();
          subscribeRealtime();
        } catch (error) {
          showToast(error.message || "Could not load cloud CRM");
        }
      }
      updateAuthUI();
      render();
      // Give Supabase up to 1.5s to consume URL hash and fire SIGNED_IN before settling
      if (!currentUser && window.location.hash.includes('access_token=')) {
        setTimeout(() => { if (!currentUser) console.warn('[boot] hash had token but session never established'); }, 1500);
      }
    }

    boot();
