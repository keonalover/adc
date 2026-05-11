import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = ".";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const leads = workbook.worksheets.add("Lead List");
const guide = workbook.worksheets.add("How To Use");
const refs = workbook.worksheets.add("Reference Lists");

for (const sheet of [leads, guide, refs]) sheet.showGridLines = false;

const headers = [
  "Company",
  "Primary Contact",
  "Email",
  "Phone",
  "City / Market",
  "State",
  "Website",
  "POS",
  "Locations",
  "Lead Source",
  "Temperature",
  "Stage",
  "Estimated Monthly Value",
  "Likely Red Flags / Pain",
  "Personalization Notes",
  "Next Action",
  "Next Action Date",
  "Do Not Contact?",
  "Owner / Internal Notes",
  "New Location",
  "Reviews Summary"
];

const examples = [
  [
    "Example Restaurant Group",
    "Jordan Lee",
    "jordan@example.com",
    "(555) 123-4567",
    "Houston",
    "TX",
    "https://example.com",
    "Toast",
    3,
    "Referral",
    "Warm",
    "Research",
    2500,
    "Overtime, delivery fees, inventory variance",
    "Recently opened a third location; mention lightweight report.",
    "Send intro email",
    new Date(2026, 4, 6),
    "No",
    "Replace this row with a real lead.",
    "Brooklyn opening Q4 2026",
    ""
  ],
  [
    "Sample Cafe Co.",
    "Avery Patel",
    "avery@example.com",
    "",
    "Dallas",
    "TX",
    "",
    "Square",
    1,
    "Google Maps",
    "Cold",
    "Research",
    1500,
    "Refunds, discounts, delivery mix",
    "Keep first email short; owner-operated.",
    "Research decision maker",
    new Date(2026, 4, 7),
    "No",
    "Optional.",
    "",
    "147 reviews, 4.6★ on Google"
  ]
];

leads.getRange("A1:U1").values = [headers];
leads.getRange("A2:U3").values = examples;
leads.getRange("A4:U103").values = Array.from({ length: 100 }, () => Array(headers.length).fill(""));

leads.getRange("A1:U1").format = {
  fill: "#2F2823",
  font: { bold: true, color: "#FFF8EF" },
  wrapText: true
};
leads.getRange("A1:U103").format = {
  font: { color: "#2F2823" },
  wrapText: true
};
leads.getRange("A2:U103").format.fill = "#FFFCF7";
leads.getRange("A1:U103").format.borders = {
  insideHorizontal: { style: "Continuous", color: "#D8CAB8" },
  insideVertical: { style: "Continuous", color: "#E8DCCC" },
  edgeBottom: { style: "Continuous", color: "#B9A792" },
  edgeTop: { style: "Continuous", color: "#B9A792" },
  edgeLeft: { style: "Continuous", color: "#B9A792" },
  edgeRight: { style: "Continuous", color: "#B9A792" }
};

const widths = [210, 150, 210, 130, 130, 70, 210, 110, 90, 130, 115, 120, 140, 250, 270, 160, 130, 120, 260, 170, 220];
widths.forEach((width, index) => {
  leads.getRangeByIndexes(0, index, 103, 1).format.columnWidthPx = width;
});
leads.getRange("A1:U1").format.rowHeightPx = 44;
leads.getRange("A2:U103").format.rowHeightPx = 54;
leads.freezePanes.freezeRows(1);

leads.tables.add("A1:U103", true, "ADCLeadList");
leads.getRange("C2:C103").format.numberFormat = "@";
leads.getRange("I2:I103").format.numberFormat = "0";
leads.getRange("M2:M103").format.numberFormat = "$#,##0";
leads.getRange("Q2:Q103").format.numberFormat = "yyyy-mm-dd";

const pos = ["Unknown", "Toast", "Clover", "Square", "Lightspeed", "Revel", "Other"];
const sources = ["Referral", "Google Maps", "LinkedIn", "Instagram", "Website", "Walk-in", "Past client", "Partner", "Other"];
const temps = ["Cold", "Warm", "Hot", "Client"];
const stages = ["Research", "Contacted", "Engaged", "Report Sent", "Won"];
const actions = ["Research decision maker", "Send intro email", "Call owner", "Send sample report", "Book intro call", "Follow up", "Final follow up", "Request exports", "Prepare report", "Wait for reply"];
const yesNo = ["No", "Yes"];

refs.getRange("A1:F1").values = [["POS", "Lead Source", "Temperature", "Stage", "Next Action", "Do Not Contact"]];
refs.getRange("A2:A8").values = pos.map((item) => [item]);
refs.getRange("B2:B10").values = sources.map((item) => [item]);
refs.getRange("C2:C5").values = temps.map((item) => [item]);
refs.getRange("D2:D6").values = stages.map((item) => [item]);
refs.getRange("E2:E11").values = actions.map((item) => [item]);
refs.getRange("F2:F3").values = yesNo.map((item) => [item]);
refs.getRange("A1:F1").format = { fill: "#A8523D", font: { bold: true, color: "#FFFFFF" } };
refs.getRange("A1:F12").format = { wrapText: true };
refs.getRange("A:F").format.columnWidthPx = 170;

leads.getRange("H2:H103").dataValidation = { rule: { type: "list", formula1: "'Reference Lists'!$A$2:$A$8" } };
leads.getRange("J2:J103").dataValidation = { rule: { type: "list", formula1: "'Reference Lists'!$B$2:$B$10" } };
leads.getRange("K2:K103").dataValidation = { rule: { type: "list", formula1: "'Reference Lists'!$C$2:$C$5" } };
leads.getRange("L2:L103").dataValidation = { rule: { type: "list", formula1: "'Reference Lists'!$D$2:$D$6" } };
leads.getRange("P2:P103").dataValidation = { rule: { type: "list", formula1: "'Reference Lists'!$E$2:$E$11" } };
leads.getRange("R2:R103").dataValidation = { rule: { type: "list", formula1: "'Reference Lists'!$F$2:$F$3" } };

leads.getRange("K2:K103").conditionalFormats.add("containsText", {
  text: "Hot",
  format: { fill: "#F2D7D3", font: { bold: true, color: "#9E342D" } }
});
leads.getRange("K2:K103").conditionalFormats.add("containsText", {
  text: "Warm",
  format: { fill: "#F7E5C7", font: { bold: true, color: "#8E5B16" } }
});
leads.getRange("R2:R103").conditionalFormats.add("containsText", {
  text: "Yes",
  format: { fill: "#9E342D", font: { bold: true, color: "#FFFFFF" } }
});

guide.getRange("A1:H1").merge();
guide.getRange("A1").values = [["ADC Outreach Lead List Template"]];
guide.getRange("A1").format = {
  fill: "#2F2823",
  font: { bold: true, color: "#FFF8EF", size: 18 },
};
guide.getRange("A3:H3").merge();
guide.getRange("A3").values = [["Fill out the Lead List sheet, then send the completed workbook back. I can import it into the CRM, generate Gmail drafts, ask for your approval, send the approved batch, and update follow-ups."]];
guide.getRange("A3").format = { wrapText: true, fill: "#F1E8DD", font: { color: "#2F2823" } };

guide.getRange("A5:B15").values = [
  ["Required", "Company and Email are the minimum fields for automated email outreach."],
  ["Strongly helpful", "Primary Contact, City / Market, POS, Locations, New Location, Reviews Summary, and Likely Red Flags / Pain."],
  ["Personalization", "Use Personalization Notes, New Location, and Reviews Summary for intro targeting details."],
  ["Do Not Contact?", "Set to Yes for leads that should stay in the CRM but should not receive email."],
  ["Next Action Date", "Leave blank if you want me to schedule the first touch automatically."],
  ["Temperature", "Cold/Warm/Hot affects prioritization and CRM filtering."],
  ["Stage", "Most new leads should start as Research."],
  ["Estimated Monthly Value", "Use a rough monthly value for prioritization; exactness is not required."],
  ["Examples", "Rows 2-3 on Lead List are examples. Replace or delete them before sending real leads."],
  ["Privacy", "Only include contacts you are comfortable using for ADC Consulting outreach."],
  ["Sending", "I will show recipients and subjects before sending any Gmail batch."]
];
guide.getRange("A5:B15").format = { wrapText: true };
guide.getRange("A5:A15").format = { fill: "#A8523D", font: { bold: true, color: "#FFFFFF" } };
guide.getRange("B5:B15").format = { fill: "#FFFCF7", font: { color: "#2F2823" } };
guide.getRange("A:B").format.columnWidthPx = 220;
guide.getRange("B:B").format.columnWidthPx = 640;
guide.getRange("A5:B15").format.rowHeightPx = 38;

const inspect = await workbook.inspect({
  kind: "table",
  range: "Lead List!A1:U5",
  include: "values,formulas",
  tableMaxRows: 5,
  tableMaxCols: 21
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan"
});
console.log(errors.ndjson);

const leadPreview = await workbook.render({ sheetName: "Lead List", range: "A1:U8", scale: 1, format: "png" });
await leadPreview.arrayBuffer();
const guidePreview = await workbook.render({ sheetName: "How To Use", range: "A1:B15", scale: 1, format: "png" });
await guidePreview.arrayBuffer();

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/ADC Outreach Lead List Template (blank).xlsx`);
