export type ReportRow = {
  time: string;
  entity: string;
  detail: string;
  confidence: string;
  camera: string;
  severity: string;
};

const HEADERS = ["Timestamp", "Entity", "Detail", "Confidence", "Camera", "Severity"];

function toMatrix(rows: ReportRow[]) {
  return rows.map((r) => [r.time, r.entity, r.detail, r.confidence, r.camera, r.severity]);
}

export async function exportExcel(rows: ReportRow[], fileName: string) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...toMatrix(rows)]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Incidents");
  XLSX.writeFile(book, `${fileName}.xlsx`);
}

export async function exportPdf(rows: ReportRow[], fileName: string, title: string, subtitle: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.text(subtitle, 14, 23);

  autoTable(doc, {
    head: [HEADERS],
    body: toMatrix(rows),
    startY: 29,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [249, 115, 22] },
  });

  doc.save(`${fileName}.pdf`);
}
