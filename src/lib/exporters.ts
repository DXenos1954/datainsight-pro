import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { ChartSuggestion, DataInsight, DataRow } from '../types';
import {
  calculateCorrelationMatrix,
  calculateFullStats,
  getColumnStatsForDataset,
  parseNumberSafely,
  prepareChartData,
} from './statistics';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseFileName(fileName: string) {
  return (fileName || 'dataset').replace(/\.[^/.]+$/, '');
}

export function exportCleanedWorkbook(
  workbook: XLSX.WorkBook | null,
  sheetNames: string[],
  currentSheet: string,
  cleanedData: DataRow[],
  fileName: string
) {
  const newWb = XLSX.utils.book_new();
  if (workbook && sheetNames.length > 0) {
    sheetNames.forEach((name) => {
      const ws =
        name === currentSheet
          ? XLSX.utils.json_to_sheet(cleanedData)
          : workbook.Sheets[name];
      XLSX.utils.book_append_sheet(newWb, ws, name.slice(0, 31));
    });
  } else {
    const ws = XLSX.utils.json_to_sheet(cleanedData);
    XLSX.utils.book_append_sheet(newWb, ws, (currentSheet || 'Data').slice(0, 31));
  }
  XLSX.writeFile(newWb, `Cleaned_${baseFileName(fileName)}.xlsx`);
}

export function exportCleanedCSV(
  headers: string[],
  cleanedData: DataRow[],
  fileName: string
) {
  const escapeCSV = (val: unknown) => {
    const s = val === undefined || val === null ? '' : String(val);
    if (s.includes('"') || s.includes(';') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.map(escapeCSV).join(';'),
    ...cleanedData.map((row) => headers.map((h) => escapeCSV(row[h])).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerDownload(blob, `Cleaned_${baseFileName(fileName)}.csv`);
}

export function exportStatsToExcel(
  data: DataRow[],
  headers: string[],
  numericHeaders: string[],
  referenceColumn: string,
  currentSheet: string
) {
  if (!data.length) return;

  const wb = XLSX.utils.book_new();

  // Sheet 1: Vertical column statistics
  const verticalMetrics: { label: string; key: string; suffix?: string }[] = [
    { label: 'Μέση Τιμή (Mean)', key: 'mean' },
    { label: 'Διάμεσος (Median)', key: 'median' },
    { label: 'Άθροισμα (Sum)', key: 'sum' },
    { label: 'Τυπική Απόκλιση (StdDev)', key: 'stdDev' },
    { label: 'Τυπικό Σφάλμα (StdError)', key: 'stdError' },
    { label: 'Συντελεστής Μεταβλητότητας (CV %)', key: 'cv', suffix: '%' },
    { label: '1ο Τεταρτημόριο (Q1)', key: 'q1' },
    { label: '3ο Τεταρτημόριο (Q3)', key: 'q3' },
    { label: 'Ενδοτεταρτημοριακό Εύρος (IQR)', key: 'iqr' },
    { label: 'Κύρτωση (Kurtosis)', key: 'kurtosis' },
    { label: 'Ασυμμετρία (Skewness)', key: 'skewness' },
    { label: `Συσχέτιση Pearson r (ως προς ${referenceColumn || '-'})`, key: 'correlation' },
    { label: `Κλίση Παλινδρόμησης Slope (ως προς ${referenceColumn || '-'})`, key: 'dependency' },
    { label: 't-statistic (vs 0)', key: 'tTest' },
    { label: 'Μέγιστη Τιμή (Max)', key: 'max' },
    { label: 'Ελάχιστη Τιμή (Min)', key: 'min' },
    { label: 'Εύρος (Range)', key: 'range' },
    { label: '95% CI Κάτω Όριο', key: 'ciLower' },
    { label: '95% CI Άνω Όριο', key: 'ciUpper' },
    { label: 'Πλήθος Έγκυρων Τιμών (N)', key: 'count' },
  ];

  const statsCache: Record<string, ReturnType<typeof getColumnStatsForDataset>> = {};
  headers.forEach((h) => {
    statsCache[h] = getColumnStatsForDataset(data, h, referenceColumn);
  });

  const verticalRows = verticalMetrics.map((metric) => {
    const row: Record<string, string | number> = {
      'Στατιστική Παράμετρος': metric.label,
    };
    headers.forEach((h) => {
      const s = statsCache[h];
      const raw = s ? (s as unknown as Record<string, number | null>)[metric.key] : null;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        row[h] = metric.suffix ? `${raw.toFixed(2)}${metric.suffix}` : Number(raw.toFixed(4));
      } else {
        row[h] = '-';
      }
    });
    return row;
  });

  const wsVertical = XLSX.utils.json_to_sheet(verticalRows);
  XLSX.utils.book_append_sheet(wb, wsVertical, 'Κάθετη Στατιστική');

  // Sheet 2: Correlation matrix
  if (numericHeaders.length >= 2) {
    const matrix = calculateCorrelationMatrix(data, numericHeaders);
    const corrRows = numericHeaders.map((colA) => {
      const row: Record<string, string | number> = { Μεταβλητή: colA };
      numericHeaders.forEach((colB) => {
        const val = matrix[colA]?.[colB];
        row[colB] = typeof val === 'number' ? Number(val.toFixed(4)) : '-';
      });
      return row;
    });
    const wsCorr = XLSX.utils.json_to_sheet(corrRows);
    XLSX.utils.book_append_sheet(wb, wsCorr, 'Πίνακας Συσχετίσεων');
  }

  // Sheet 3: Horizontal row statistics
  if (numericHeaders.length > 0) {
    const horizontalRows = data.slice(0, 1000).map((row, idx) => {
      const nums = numericHeaders
        .map((h) => parseNumberSafely(row[h]))
        .filter((n) => Number.isFinite(n));
      const s = calculateFullStats(nums);
      return {
        [headers[0] || 'Γραμμή']: row[headers[0]] || `Γραμμή ${idx + 1}`,
        'Μέση Τιμή': s ? Number(s.mean.toFixed(4)) : '-',
        Διάμεσος: s ? Number(s.median.toFixed(4)) : '-',
        Άθροισμα: s ? Number(s.sum.toFixed(4)) : '-',
        'Τυπ. Απόκλιση': s ? Number(s.stdDev.toFixed(4)) : '-',
        'CV (%)': s ? `${s.cv.toFixed(2)}%` : '-',
        Ελάχιστο: s ? s.min : '-',
        Μέγιστο: s ? s.max : '-',
        Εύρος: s ? s.range : '-',
        'Πλήθος (N)': s ? s.count : 0,
      };
    });
    const wsHoriz = XLSX.utils.json_to_sheet(horizontalRows);
    XLSX.utils.book_append_sheet(wb, wsHoriz, 'Οριζόντια Στατιστική');
  }

  XLSX.writeFile(wb, `Stats_${(currentSheet || 'Sheet').replace(/\s+/g, '_')}.xlsx`);
}

export async function exportSummaryToWord(
  insights: DataInsight,
  fileName: string,
  currentSheet: string
) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: 'ΕΚΘΕΣΗ ΣΤΑΤΙΣΤΙΚΗΣ ΑΝΑΛΥΣΗΣ & ΕΥΡΗΜΑΤΩΝ AI',
          bold: true,
          size: 32,
          color: '1E3A8A',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: `Ημερομηνία: ${new Date().toLocaleDateString('el-GR')}  ·  Αρχείο: ${fileName}  ·  Φύλλο: ${currentSheet}`,
          italics: true,
          size: 20,
          color: '64748B',
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({ text: '1. Επιτελική Σύνοψη', bold: true, size: 24, color: '1E3A8A' }),
      ],
    }),
    ...insights.summary
      .split(/\n+/)
      .filter(Boolean)
      .map(
        (para) =>
          new Paragraph({
            spacing: { after: 180 },
            children: [new TextRun({ text: para, size: 22 })],
          })
      ),
  ];

  if (insights.keyFindings && insights.keyFindings.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({ text: '2. Βασικά Ευρήματα', bold: true, size: 24, color: '1E3A8A' }),
        ],
      }),
      ...insights.keyFindings.map(
        (finding) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: [new TextRun({ text: finding, size: 21 })],
          })
      )
    );
  }

  if (insights.statistics && insights.statistics.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
        children: [
          new TextRun({
            text: '3. Αναλυτική Στατιστική Ερμηνεία ανά Στήλη',
            bold: true,
            size: 24,
            color: '1E3A8A',
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 26, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A' },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Στήλη', bold: true, color: 'FFFFFF' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 18, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A' },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Τύπος', bold: true, color: 'FFFFFF' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 56, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A' },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Μετρικές & Στατιστικός Σχολιασμός', bold: true, color: 'FFFFFF' }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          ...insights.statistics.map((stat) => {
            const lines: string[] = [];
            if (stat.type === 'numeric') {
              lines.push(
                `Μέσος Όρος: ${stat.mean?.toLocaleString('el-GR', { maximumFractionDigits: 2 }) ?? '-'}  |  Διάμεσος: ${stat.median?.toLocaleString('el-GR', { maximumFractionDigits: 2 }) ?? '-'}  |  Min: ${stat.min?.toLocaleString('el-GR') ?? '-'}  |  Max: ${stat.max?.toLocaleString('el-GR') ?? '-'}`
              );
            } else if (stat.topValues?.length) {
              lines.push(
                `Κυρίαρχες τιμές: ${stat.topValues
                  .slice(0, 3)
                  .map((v) => `${v.value} (N=${v.count})`)
                  .join(', ')}`
              );
            }
            if (stat.description) {
              lines.push(stat.description);
            }
            return new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: stat.column, bold: true })] })],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: stat.type === 'numeric' ? 'Αριθμητική' : 'Κατηγορική',
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  children: lines.map(
                    (line) =>
                      new Paragraph({
                        spacing: { after: 60 },
                        children: [new TextRun({ text: line, size: 19 })],
                      })
                  ),
                }),
              ],
            });
          }),
        ],
      })
    );
  }

  if (insights.presentationOutline?.slides?.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 340, after: 140 },
        children: [
          new TextRun({ text: '4. Διάρθρωση Παρουσίασης', bold: true, size: 24, color: '1E3A8A' }),
        ],
      }),
      ...insights.presentationOutline.slides.flatMap((slide, idx) => [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 80 },
          children: [
            new TextRun({
              text: `Διαφάνεια ${idx + 1}: ${slide.title}`,
              bold: true,
              size: 21,
              color: '0284C7',
            }),
          ],
        }),
        ...(slide.content || []).map(
          (pt) =>
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 60 },
              children: [new TextRun({ text: pt, size: 20 })],
            })
        ),
      ])
    );
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `AI_Report_${baseFileName(fileName)}.docx`);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function exportChartsToWord(
  charts: ChartSuggestion[],
  data: DataRow[],
  fileName: string,
  chartImages?: Record<string, string>
) {
  if (charts.length === 0) return;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: 'ΕΚΘΕΣΗ ΓΡΑΦΙΚΩΝ ΠΑΡΑΣΤΑΣΕΩΝ & ΔΕΔΟΜΕΝΩΝ',
          bold: true,
          size: 32,
          color: '0F766E',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: `Ημερομηνία: ${new Date().toLocaleDateString('el-GR')}  ·  Αρχείο: ${fileName}`,
          italics: true,
          size: 20,
          color: '64748B',
        }),
      ],
    }),
  ];

  charts.forEach((chart, idx) => {
    const { rows, xKey, seriesKeys, isColumnOrientation } = prepareChartData(data, chart, 30);
    const displayXLabel = isColumnOrientation ? 'Στήλη / Μεταβλητή (X)' : xKey;
    const displayYLabel = seriesKeys.join(', ') || chart.yAxis;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 100 },
        children: [
          new TextRun({
            text: `${idx + 1}. ${chart.title || 'Γράφημα'}`,
            bold: true,
            size: 24,
            color: '0F766E',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Τύπος: ', bold: true }),
          new TextRun({ text: chart.type.toUpperCase() }),
          new TextRun({ text: '  ·  Άξονας X: ', bold: true }),
          new TextRun({ text: displayXLabel }),
          new TextRun({ text: '  ·  Άξονας Y: ', bold: true }),
          new TextRun({ text: displayYLabel }),
        ],
      })
    );

    if (chart.description) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: chart.description, italics: true, color: '475569' })],
        })
      );
    }

    const imgUrl = chartImages?.[chart.id];
    if (imgUrl) {
      try {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new ImageRun({
                data: dataUrlToUint8Array(imgUrl),
                transformation: { width: 560, height: 300 },
                type: 'png',
              }),
            ],
          })
        );
      } catch {
        // Ignore image failure and still include clean table
      }
    }

    const sampleRows = rows.slice(0, 20);
    const tableSeries = seriesKeys.slice(0, 4);
    if (sampleRows.length > 0 && tableSeries.length > 0) {
      const colWidth = Math.floor(100 / (1 + tableSeries.length));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: colWidth, type: WidthType.PERCENTAGE },
                  shading: { fill: '0F766E' },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: displayXLabel, bold: true, color: 'FFFFFF' })],
                    }),
                  ],
                }),
                ...tableSeries.map(
                  (sKey) =>
                    new TableCell({
                      width: { size: colWidth, type: WidthType.PERCENTAGE },
                      shading: { fill: '0F766E' },
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: sKey, bold: true, color: 'FFFFFF' })],
                        }),
                      ],
                    })
                ),
              ],
            }),
            ...sampleRows.map((r) => {
              const xStr = String(r[xKey] ?? '-');
              return new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: xStr })] })] }),
                  ...tableSeries.map((sKey) => {
                    const yRaw = r[sKey];
                    const yStr =
                      typeof yRaw === 'number'
                        ? yRaw.toLocaleString('el-GR', { maximumFractionDigits: 3 })
                        : String(yRaw ?? '-');
                    return new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: yStr })] })],
                    });
                  }),
                ],
              });
            }),
          ],
        })
      );
    }
  });

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Charts_Report_${baseFileName(fileName)}.docx`);
}

export async function exportPresentationPPTX(
  insights: DataInsight,
  charts: ChartSuggestion[],
  data: DataRow[],
  fileName: string,
  currentSheet: string
) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'DataInsight Pro';
  pres.title = insights.presentationOutline.title || 'Αναλυτική Έκθεση Δεδομένων';

  // Slide 1: Cover Slide
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: '0F172A' };
  titleSlide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.25,
    h: 5.625,
    fill: { color: '2563EB' },
  });
  titleSlide.addText(insights.presentationOutline.title || 'Αναλυτική Έκθεση Δεδομένων', {
    x: 0.9,
    y: 1.75,
    w: 8.4,
    h: 1.4,
    fontSize: 36,
    bold: true,
    color: 'FFFFFF',
    fontFace: 'Calibri',
  });
  titleSlide.addText(
    `Αρχείο: ${fileName}   |   Φύλλο: ${currentSheet}   |   Ημερομηνία: ${new Date().toLocaleDateString('el-GR')}`,
    {
      x: 0.9,
      y: 3.35,
      w: 8.4,
      h: 0.6,
      fontSize: 14,
      color: '94A3B8',
      fontFace: 'Calibri',
    }
  );
  titleSlide.addText(`Επεξεργασμένες εγγραφές: ${data.length.toLocaleString('el-GR')}`, {
    x: 0.9,
    y: 4.0,
    w: 8.4,
    h: 0.4,
    fontSize: 13,
    color: '60A5FA',
    fontFace: 'Calibri',
  });

  // Content slides
  insights.presentationOutline.slides.forEach((slideData, sIdx) => {
    const slide = pres.addSlide();
    slide.background = { color: 'FFFFFF' };

    // Top accent strip
    slide.addShape(pres.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.12,
      fill: { color: '2563EB' },
    });

    slide.addText(slideData.title || `Διαφάνεια ${sIdx + 1}`, {
      x: 0.55,
      y: 0.35,
      w: 8.9,
      h: 0.6,
      fontSize: 23,
      bold: true,
      color: '0F172A',
      fontFace: 'Calibri',
    });

    const chartInfo =
      slideData.chartIndex !== undefined &&
      slideData.chartIndex >= 0 &&
      charts[slideData.chartIndex]
        ? charts[slideData.chartIndex]
        : undefined;

    const bulletPoints = (slideData.content || []).map((text) => ({
      text,
      options: {
        bullet: true,
        color: '334155',
        fontSize: 14,
        paraSpaceAfter: 10,
        fontFace: 'Calibri',
      },
    }));

    slide.addText(bulletPoints, {
      x: 0.55,
      y: 1.15,
      w: chartInfo ? 4.4 : 8.9,
      h: 3.8,
      valign: 'top',
    });

    if (chartInfo) {
      const { rows, xKey, seriesKeys } = prepareChartData(data, chartInfo, 25);
      if (rows.length > 0 && seriesKeys.length > 0) {
        try {
          if (chartInfo.type === 'scatter') {
            const xVals = rows.map((r) => parseNumberSafely(r[xKey]) || 0);
            const yVals = rows.map((r) => parseNumberSafely(r[seriesKeys[0]]) || 0);
            slide.addChart(
              pres.ChartType.scatter,
              [
                { name: xKey === '__column__' ? 'Στήλες' : xKey, values: xVals },
                { name: seriesKeys[0], values: yVals },
              ],
              {
                x: 5.15,
                y: 1.1,
                w: 4.4,
                h: 3.55,
                showLegend: true,
                legendPos: 'b',
                showTitle: true,
                title: chartInfo.title,
                titleFontSize: 11,
                chartColors: ['2563EB'],
              }
            );
          } else {
            const labels = rows.map((r) => String(r[xKey] ?? '').slice(0, 24));
            let cType = pres.ChartType.bar;
            if (chartInfo.type === 'line') cType = pres.ChartType.line;
            if (chartInfo.type === 'pie') cType = pres.ChartType.pie;

            const activeSeries = chartInfo.type === 'pie' ? seriesKeys.slice(0, 1) : seriesKeys.slice(0, 6);
            const chartDataSeries = activeSeries.map((sKey) => ({
              name: sKey,
              labels,
              values: rows.map((r) => parseNumberSafely(r[sKey]) || 0),
            }));

            slide.addChart(cType, chartDataSeries, {
              x: 5.15,
              y: 1.1,
              w: 4.4,
              h: 3.55,
              showLegend: chartInfo.type === 'pie' || activeSeries.length > 1,
              legendPos: 'b',
              showTitle: true,
              title: chartInfo.title,
              titleFontSize: 11,
              chartColors: ['2563EB', '0D9488', 'D97706', 'DC2626', '6366F1', '0284C7'],
            });
          }

          if (chartInfo.description) {
            slide.addText(chartInfo.description, {
              x: 5.15,
              y: 4.72,
              w: 4.4,
              h: 0.45,
              fontSize: 9,
              italic: true,
              color: '64748B',
              align: 'center',
              fontFace: 'Calibri',
            });
          }
        } catch (err) {
          console.error('Chart export error in PPTX slide:', err);
        }
      }
    }

    slide.addText(`DataInsight Pro  ·  ${sIdx + 2} / ${insights.presentationOutline.slides.length + 1}`, {
      x: 0.55,
      y: 5.2,
      w: 8.9,
      h: 0.28,
      fontSize: 9,
      color: '94A3B8',
      align: 'right',
      fontFace: 'Calibri',
    });
  });

  await pres.writeFile({ fileName: `Presentation_${baseFileName(fileName)}.pptx` });
}
