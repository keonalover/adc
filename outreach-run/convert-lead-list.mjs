import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2] || "../ADC Outreach Lead List Template.xlsx";
const outputDir = process.argv[3] || ".";
const today = localDate();

await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const inspected = await workbook.inspect({
  kind: "table",
  range: "Lead List!A1:U500",
  include: "values",
  tableMaxRows: 500,
  tableMaxCols: 21,
  maxChars: 200000
});

const table = parseFirstJson(inspected.ndjson);
const [headers, ...rows] = table.values || [];
if (!headers?.length) throw new Error("Could not find Lead List headers.");

const leads = [];
const warnings = [];
const seenEmails = new Map();

for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
  const rowNumber = rowIndex + 2;
  const record = Object.fromEntries(headers.map((header, index) => [header, rows[rowIndex][index] ?? ""]));
  const company = clean(record.Company);
  const email = clean(record.Email);
  const doNotContact = isYes(record["Do Not Contact?"]);

  if (!company && !email) continue;
  if (looksLikeExample(company, email)) {
    warnings.push({ row: rowNumber, company, email, severity: "skip", message: "Example/template row skipped." });
    continue;
  }
  if (doNotContact) {
    warnings.push({ row: rowNumber, company, email, severity: "skip", message: "Do Not Contact = Yes." });
    continue;
  }
  if (!company) warnings.push({ row: rowNumber, company, email, severity: "warning", message: "Missing company." });
  if (!isValidEmail(email)) warnings.push({ row: rowNumber, company, email, severity: "warning", message: "Missing or invalid email." });
  if (email) {
    const key = email.toLowerCase();
    if (seenEmails.has(key)) {
      warnings.push({ row: rowNumber, company, email, severity: "skip", message: `Duplicate email also appears on row ${seenEmails.get(key)}.` });
      continue;
    }
    seenEmails.set(key, rowNumber);
  }

  leads.push({
    id: uid(),
    company,
    contact: clean(record["Primary Contact"]),
    email,
    phone: clean(record.Phone),
    city: clean(record["City / Market"]),
    state: clean(record.State),
    website: clean(record.Website),
    pos: clean(record.POS) || "Unknown",
    locations: Number(record.Locations || 1),
    source: clean(record["Lead Source"]),
    temperature: clean(record.Temperature) || "Cold",
    stage: clean(record.Stage) || "Research",
    value: Number(record["Estimated Monthly Value"] || 0),
    pain: clean(record["Likely Red Flags / Pain"]),
    personalization: clean(record["Personalization Notes"]),
    newLocation: clean(record["New Location"]),
    reviewsSummary: clean(record["Reviews Summary"]),
    nextAction: clean(record["Next Action"]) || "Send intro email",
    nextDate: normalizeDate(record["Next Action Date"]) || today,
    doNotContact: false,
    notes: clean(record["Owner / Internal Notes"]),
    sequenceStep: 0,
    touches: 0,
    lastTouch: "",
    updatedAt: Date.now()
  });
}

const baseName = path.basename(inputPath, path.extname(inputPath)).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const jsonPath = path.join(outputDir, `${baseName || "adc-leads"}-crm-import.json`);
const summaryPath = path.join(outputDir, `${baseName || "adc-leads"}-summary.json`);
const draftPreviewPath = path.join(outputDir, `${baseName || "adc-leads"}-draft-preview.json`);
const draftPreview = leads
  .filter((lead) => isValidEmail(lead.email))
  .map((lead) => {
    const draft = generateDraft(lead);
    const [subjectLine, ...bodyLines] = draft.split("\n");
    return {
      company: lead.company,
      contact: lead.contact,
      to: lead.email,
      subject: subjectLine.replace("Subject: ", ""),
      body: bodyLines.join("\n").trim()
    };
  });

await fs.writeFile(jsonPath, JSON.stringify(leads, null, 2), "utf8");
await fs.writeFile(draftPreviewPath, JSON.stringify(draftPreview, null, 2), "utf8");
await fs.writeFile(summaryPath, JSON.stringify({
  input: path.resolve(inputPath),
  createdAt: new Date().toISOString(),
  totalImportable: leads.length,
  validEmailCount: leads.filter((lead) => isValidEmail(lead.email)).length,
  draftPreviewCount: draftPreview.length,
  warningCount: warnings.length,
  warnings
}, null, 2), "utf8");

console.log(JSON.stringify({
  jsonPath: path.resolve(jsonPath),
  summaryPath: path.resolve(summaryPath),
  draftPreviewPath: path.resolve(draftPreviewPath),
  leads: leads.length,
  draftPreviews: draftPreview.length,
  warnings: warnings.length
}, null, 2));

function parseFirstJson(ndjson) {
  const line = String(ndjson || "").split(/\r?\n/).find((entry) => entry.trim().startsWith("{"));
  if (!line) throw new Error("Spreadsheet inspection returned no table data.");
  return JSON.parse(line);
}

function clean(value) {
  if (value == null) return "";
  if (value instanceof Date) return localDate(value);
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

function isYes(value) {
  return ["yes", "y", "true", "1"].includes(clean(value).toLowerCase());
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(email));
}

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) return localDate(value);
  if (typeof value === "number") return excelSerialDate(value);
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : localDate(parsed);
}

function excelSerialDate(serial) {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  epoch.setUTCDate(epoch.getUTCDate() + Number(serial));
  return localDate(epoch);
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function looksLikeExample(company, email) {
  return /example|sample/i.test(company) || /example\.com$/i.test(email);
}

function uid() {
  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function generateDraft(lead) {
  const firstName = (lead.contact || "there").split(" ")[0];
  const pain = lead.pain || "labor, delivery, inventory, refund, discount, or invoice patterns";
  const context = [lead.personalization, lead.newLocation, lead.reviewsSummary].filter(Boolean).join(" ");
  const personalization = context ? `\n\nI noticed: ${context}` : "";
  return `Subject: Quick red-flag review for ${lead.company}\n\nHi ${firstName},${personalization}\n\nI work with ADC Consulting. We help independent F&B operators spot hidden margin leaks across POS, labor, delivery, inventory, invoices, refunds, discounts, and waste reports.\n\nIf useful, I can do a free one-time Red Flag Report for ${lead.company}. You send the exports you already have, and I send back a concise summary of what looks worth checking.\n\nFor ${lead.company}, I would especially look around ${pain}.\n\nWould it be worth a short intro call next week?\n\n— An Pham`;
}
