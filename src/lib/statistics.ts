import {
  AggregationMode,
  ChartSuggestion,
  CleaningOptions,
  CleaningStats,
  DataRow,
  FullStats,
} from '../types';

export const parseNumberSafely = (v: unknown): number => {
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'boolean') return NaN;
  if (typeof v === 'string') {
    let trimmed = v.trim();
    if (trimmed === '') return NaN;

    // Strip common currency/percentage formatting while keeping digits, signs, separators
    trimmed = trimmed.replace(/[€$£%\s]/g, '');
    if (trimmed === '' || trimmed === '-' || trimmed === '+') return NaN;

    const commaCount = (trimmed.match(/,/g) || []).length;
    const dotCount = (trimmed.match(/\./g) || []).length;

    if (commaCount > 0 && dotCount > 0) {
      if (trimmed.lastIndexOf('.') < trimmed.lastIndexOf(',')) {
        // European format: 1.234,56
        trimmed = trimmed.replace(/\./g, '').replace(',', '.');
      } else {
        // US format: 1,234.56
        trimmed = trimmed.replace(/,/g, '');
      }
    } else if (commaCount === 1 && dotCount === 0) {
      // Single comma: check if decimal or thousands
      const afterComma = trimmed.split(',')[1];
      if (afterComma && afterComma.length === 3 && trimmed.split(',')[0].replace('-', '').length <= 3) {
        // Ambiguous like 1,250 vs 1,250 decimal — in Greek locale comma is decimal unless multiple commas
        trimmed = trimmed.replace(',', '.');
      } else {
        trimmed = trimmed.replace(',', '.');
      }
    } else if (commaCount > 1 && dotCount === 0) {
      trimmed = trimmed.replace(/,/g, '');
    } else if (dotCount > 1 && commaCount === 0) {
      trimmed = trimmed.replace(/\./g, '');
    }

    const num = Number(trimmed);
    return Number.isFinite(num) ? num : NaN;
  }
  return NaN;
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
};

export const calculateFullStats = (
  numbers: number[],
  pairedValues?: { x: number; y: number }[]
): FullStats | null => {
  const validNumbers = numbers.filter((n) => Number.isFinite(n));
  if (validNumbers.length === 0) return null;

  const n = validNumbers.length;
  const sorted = [...validNumbers].sort((a, b) => a - b);
  const sum = validNumbers.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;

  const variance =
    n > 1
      ? validNumbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const stdError = stdDev / Math.sqrt(n);
  const cv = mean === 0 ? 0 : (stdDev / Math.abs(mean)) * 100;

  let skewness = 0;
  if (n > 2 && stdDev !== 0) {
    const sum3 = validNumbers.reduce((a, b) => a + Math.pow((b - mean) / stdDev, 3), 0);
    skewness = (n / ((n - 1) * (n - 2))) * sum3;
  }

  let kurtosis = 0;
  if (n > 3 && stdDev !== 0) {
    const sum4 = validNumbers.reduce((a, b) => a + Math.pow((b - mean) / stdDev, 4), 0);
    const term1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
    const term2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    kurtosis = term1 * sum4 - term2;
  }

  const max = sorted[sorted.length - 1];
  const min = sorted[0];
  const range = max - min;
  const ciLower = mean - 1.96 * stdError;
  const ciUpper = mean + 1.96 * stdError;

  // Properly paired Pearson r & OLS slope (y = target column, x = reference column)
  let correlation: number | null = null;
  let dependency: number | null = null;
  if (pairedValues && pairedValues.length >= 2) {
    const pn = pairedValues.length;
    const meanX = pairedValues.reduce((acc, p) => acc + p.x, 0) / pn;
    const meanY = pairedValues.reduce((acc, p) => acc + p.y, 0) / pn;

    let covXY = 0;
    let ssX = 0;
    let ssY = 0;
    for (const p of pairedValues) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      covXY += dx * dy;
      ssX += dx * dx;
      ssY += dy * dy;
    }

    const denom = Math.sqrt(ssX * ssY);
    correlation = denom === 0 ? 0 : covXY / denom;
    dependency = ssX === 0 ? 0 : covXY / ssX;
  }

  const tTest = stdError === 0 ? 0 : mean / stdError;

  return {
    mean,
    median,
    sum,
    stdDev,
    stdError,
    cv,
    q1,
    q3,
    iqr,
    kurtosis,
    skewness,
    max,
    min,
    range,
    ciLower,
    ciUpper,
    count: n,
    correlation,
    dependency,
    tTest,
  };
};

export const getColumnStatsForDataset = (
  data: DataRow[],
  column: string,
  referenceColumn?: string
): FullStats | null => {
  const numbers: number[] = [];
  const pairs: { x: number; y: number }[] = [];

  for (const row of data) {
    const y = parseNumberSafely(row[column]);
    if (Number.isFinite(y)) {
      numbers.push(y);
      if (referenceColumn) {
        const x = parseNumberSafely(row[referenceColumn]);
        if (Number.isFinite(x)) {
          pairs.push({ x, y });
        }
      }
    }
  }

  return calculateFullStats(numbers, referenceColumn ? pairs : undefined);
};

export const calculateCorrelationMatrix = (
  data: DataRow[],
  numericHeaders: string[]
): Record<string, Record<string, number | null>> => {
  const matrix: Record<string, Record<string, number | null>> = {};

  for (const colA of numericHeaders) {
    matrix[colA] = {};
    for (const colB of numericHeaders) {
      if (colA === colB) {
        matrix[colA][colB] = 1;
        continue;
      }
      const pairs: { x: number; y: number }[] = [];
      for (const row of data) {
        const x = parseNumberSafely(row[colA]);
        const y = parseNumberSafely(row[colB]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          pairs.push({ x, y });
        }
      }
      if (pairs.length < 2) {
        matrix[colA][colB] = null;
        continue;
      }
      const meanX = pairs.reduce((s, p) => s + p.x, 0) / pairs.length;
      const meanY = pairs.reduce((s, p) => s + p.y, 0) / pairs.length;
      let cov = 0;
      let ssX = 0;
      let ssY = 0;
      for (const p of pairs) {
        const dx = p.x - meanX;
        const dy = p.y - meanY;
        cov += dx * dy;
        ssX += dx * dx;
        ssY += dy * dy;
      }
      const denom = Math.sqrt(ssX * ssY);
      matrix[colA][colB] = denom === 0 ? 0 : cov / denom;
    }
  }

  return matrix;
};

export const cleanDataset = (
  rawRows: DataRow[],
  rawDisplayRows: DataRow[],
  headersList: string[],
  options: CleaningOptions
): {
  cleaned: DataRow[];
  display: DataRow[];
  log: string[];
  stats: CleaningStats;
} => {
  const log: string[] = [];
  let totalCells = 0;
  let parsedNumbers = 0;
  let emptyCells = 0;
  let imputedCells = 0;
  let categoricalCells = 0;
  let removedSummaryRows = 0;
  let removedDuplicateRows = 0;

  const colNumCounts: Record<string, number> = {};
  const colNonEmptyCounts: Record<string, number> = {};
  headersList.forEach((h) => {
    colNumCounts[h] = 0;
    colNonEmptyCounts[h] = 0;
  });

  // Step 1: Filter summary rows and duplicates while keeping cleaned & display synced
  const keptIndices: number[] = [];
  const seenSignatures = new Set<string>();

  rawRows.forEach((row, idx) => {
    if (options.removeSummaryRows) {
      const isSummary = Object.values(row).some(
        (val) =>
          typeof val === 'string' &&
          /(^|\s)(σύνολο|συνολο|γενικό σύνολο|total|grand total|subtotal)(\s|:|$)/i.test(val.trim())
      );
      if (isSummary) {
        removedSummaryRows++;
        log.push(`Γραμμή ${idx + 2}: Αφαιρέθηκε συγκεντρωτική γραμμή (Σύνολο/Total) για αποφυγή διπλομέτρησης.`);
        return;
      }
    }

    if (options.removeDuplicates) {
      const signature = headersList.map((h) => String(row[h] ?? '').trim()).join('||');
      if (seenSignatures.has(signature)) {
        removedDuplicateRows++;
        log.push(`Γραμμή ${idx + 2}: Αφαιρέθηκε διπλότυπη εγγραφή.`);
        return;
      }
      seenSignatures.add(signature);
    }

    keptIndices.push(idx);
  });

  // Step 2: Parse values & detect column types
  const interimCleaned: DataRow[] = [];
  const interimDisplay: DataRow[] = [];

  keptIndices.forEach((origIdx, rowPos) => {
    const row = rawRows[origIdx];
    const dispRow = rawDisplayRows[origIdx] || row;
    const newRow: DataRow = {};
    const newDispRow: DataRow = {};

    headersList.forEach((key) => {
      const val = row[key];
      const dVal = dispRow[key];
      totalCells++;

      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        newRow[key] = '';
        newDispRow[key] = '';
        emptyCells++;
        if (log.length < 40) {
          log.push(`Γραμμή ${rowPos + 1}, στήλη «${key}»: Κενή τιμή.`);
        }
      } else {
        colNonEmptyCounts[key]++;
        const parsed = parseNumberSafely(val);
        if (Number.isFinite(parsed)) {
          newRow[key] = typeof val === 'number' ? val : parsed;
          newDispRow[key] =
            dVal !== undefined && dVal !== null && String(dVal).trim() !== ''
              ? options.trimWhitespace && typeof dVal === 'string'
                ? dVal.trim()
                : dVal
              : newRow[key];
          parsedNumbers++;
          colNumCounts[key]++;
        } else {
          const cleanStr =
            typeof val === 'string' ? (options.trimWhitespace ? val.trim() : val) : String(val);
          newRow[key] = cleanStr;
          newDispRow[key] =
            typeof dVal === 'string' ? (options.trimWhitespace ? dVal.trim() : dVal) : cleanStr;
          categoricalCells++;
        }
      }
    });

    interimCleaned.push(newRow);
    interimDisplay.push(newDispRow);
  });

  const numericColumns: string[] = [];
  const categoricalColumns: string[] = [];

  headersList.forEach((h) => {
    const nonEmpty = colNonEmptyCounts[h];
    const ratio = nonEmpty > 0 ? colNumCounts[h] / nonEmpty : 0;
    if (nonEmpty > 0 && ratio >= 0.5) {
      numericColumns.push(h);
    } else {
      categoricalColumns.push(h);
    }
  });

  // Step 3: Optional imputation for numeric missing values
  if (options.missingValueStrategy !== 'omit') {
    const fillValues: Record<string, number> = {};
    numericColumns.forEach((col) => {
      const nums = interimCleaned.map((r) => parseNumberSafely(r[col])).filter((n) => Number.isFinite(n));
      if (nums.length === 0) return;
      if (options.missingValueStrategy === 'mean') {
        fillValues[col] = Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
      } else if (options.missingValueStrategy === 'median') {
        const sorted = [...nums].sort((a, b) => a - b);
        fillValues[col] = Number(percentile(sorted, 0.5).toFixed(4));
      } else if (options.missingValueStrategy === 'zero') {
        fillValues[col] = 0;
      }
    });

    interimCleaned.forEach((row, rIdx) => {
      numericColumns.forEach((col) => {
        if (row[col] === '' && fillValues[col] !== undefined) {
          row[col] = fillValues[col];
          interimDisplay[rIdx][col] = fillValues[col].toLocaleString('el-GR', {
            maximumFractionDigits: 2,
          });
          imputedCells++;
        }
      });
    });

    if (imputedCells > 0) {
      const stratLabel =
        options.missingValueStrategy === 'mean'
          ? 'Μέσο Όρο'
          : options.missingValueStrategy === 'median'
            ? 'Διάμεσο'
            : 'Μηδέν (0)';
      log.unshift(`Συμπληρώθηκαν ${imputedCells} ελλιπή αριθμητικά κελιά με μέθοδο: ${stratLabel}.`);
    }
  }

  return {
    cleaned: interimCleaned,
    display: interimDisplay,
    log: Array.from(new Set(log)).slice(0, 30),
    stats: {
      totalCells,
      parsedNumbers,
      emptyCells,
      imputedCells,
      categoricalCells,
      removedSummaryRows,
      removedDuplicateRows,
      numericColumns,
      categoricalColumns,
    },
  };
};

export const findMatchingColumnKey = (data: DataRow[], target: string): string => {
  if (!target || data.length === 0) return target;
  const keys = Object.keys(data[0]);
  const exact = keys.find((k) => k === target);
  if (exact) return exact;
  const normalized = target.toLowerCase().trim();
  return keys.find((k) => k.toLowerCase().trim() === normalized) || target;
};

export const getRowLabelColumn = (headers: string[], numericColumns: string[]): string => {
  return headers.find((h) => !numericColumns.includes(h)) || headers[0] || '';
};

export const getRowLabels = (
  data: DataRow[],
  headers: string[],
  numericColumns: string[]
): string[] => {
  const labelCol = getRowLabelColumn(headers, numericColumns);
  const used = new Map<string, number>();
  return data.map((row, idx) => {
    const raw = labelCol ? row[labelCol] : undefined;
    const base =
      raw !== undefined && raw !== null && String(raw).trim() !== ''
        ? String(raw).trim()
        : `Γραμμή ${idx + 1}`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
};

export interface PreparedChartData {
  rows: DataRow[];
  xKey: string;
  yKey: string;
  seriesKeys: string[];
  isColumnOrientation: boolean;
}

export const prepareChartData = (
  data: DataRow[],
  chart: ChartSuggestion,
  maxPoints = 60,
  headers: string[] = [],
  numericColumns: string[] = []
): PreparedChartData => {
  const effectiveHeaders = headers.length > 0 ? headers : Object.keys(data[0] || {});
  const effectiveNumeric =
    numericColumns.length > 0
      ? numericColumns
      : effectiveHeaders.filter((h) => {
          const vals = data.map((r) => parseNumberSafely(r[h])).filter((n) => Number.isFinite(n));
          return vals.length > 0 && vals.length >= data.length * 0.4;
        });

  if (chart.orientation === 'columns') {
    const xKey = '__column__';
    const baseCols =
      chart.xColumns && chart.xColumns.length > 0 ? chart.xColumns : effectiveNumeric;
    const activeCols = baseCols.filter(
      (col) => effectiveHeaders.includes(col) && !(chart.excludedXValues?.includes(col))
    );

    if (activeCols.length === 0) {
      return {
        rows: [],
        xKey,
        yKey: '',
        seriesKeys: [],
        isColumnOrientation: true,
      };
    }

    const rowLabels = getRowLabels(data, effectiveHeaders, effectiveNumeric);
    const mode = chart.seriesMode || 'avg';

    if (mode === 'sum' || mode === 'avg') {
      const seriesName = mode === 'sum' ? 'Άθροισμα' : 'Μέσος Όρος';
      const outRows: DataRow[] = activeCols.slice(0, maxPoints).map((col) => {
        const nums = data
          .map((r) => parseNumberSafely(r[col]))
          .filter((n) => Number.isFinite(n));
        const sum = nums.reduce((acc, n) => acc + n, 0);
        const val =
          nums.length === 0
            ? 0
            : mode === 'sum'
              ? Number(sum.toFixed(3))
              : Number((sum / nums.length).toFixed(3));
        const xVal = chart.type === 'scatter' ? parseNumberSafely(col) : col;
        return {
          [xKey]: chart.type === 'scatter' && Number.isFinite(xVal) ? xVal : col,
          [seriesName]: val,
        };
      });

      return {
        rows: outRows,
        xKey,
        yKey: seriesName,
        seriesKeys: [seriesName],
        isColumnOrientation: true,
      };
    }

    // Single row or multi-row comparison across column headers
    const desiredLabels =
      chart.selectedRows && chart.selectedRows.length > 0
        ? chart.selectedRows.filter((lbl) => rowLabels.includes(lbl))
        : mode === 'row'
          ? rowLabels.slice(0, 1)
          : rowLabels.slice(0, 5);

    const effectiveLabels = desiredLabels.length > 0 ? desiredLabels : rowLabels.slice(0, 1);
    const labelToIndex = new Map<string, number>();
    rowLabels.forEach((lbl, idx) => labelToIndex.set(lbl, idx));

    const outRows: DataRow[] = activeCols.slice(0, maxPoints).map((col) => {
      const xVal = chart.type === 'scatter' ? parseNumberSafely(col) : col;
      const point: DataRow = {
        [xKey]: chart.type === 'scatter' && Number.isFinite(xVal) ? xVal : col,
      };
      effectiveLabels.forEach((lbl) => {
        const rowIdx = labelToIndex.get(lbl);
        const rawVal = rowIdx !== undefined ? data[rowIdx]?.[col] : undefined;
        const num = parseNumberSafely(rawVal);
        point[lbl] = Number.isFinite(num) ? num : 0;
      });
      return point;
    });

    return {
      rows: outRows,
      xKey,
      yKey: effectiveLabels[0] || '',
      seriesKeys: effectiveLabels,
      isColumnOrientation: true,
    };
  }

  // Standard row-based orientation
  const xKey = findMatchingColumnKey(data, chart.xAxis);
  const yKey = findMatchingColumnKey(data, chart.yAxis);

  const filtered = data.filter((row) => {
    const xRaw = row[xKey];
    const yRaw = row[yKey];
    if (xRaw === undefined || xRaw === null || xRaw === '') return false;
    const xStr = String(xRaw);
    const yStr = String(yRaw ?? '');
    if (chart.excludedXValues?.includes(xStr)) return false;
    if (chart.excludedYValues?.includes(yStr)) return false;
    return true;
  });

  if (chart.type === 'scatter') {
    const scatterRows = filtered
      .map((row) => {
        const xNum = parseNumberSafely(row[xKey]);
        const yNum = parseNumberSafely(row[yKey]);
        if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) return null;
        return { ...row, [xKey]: xNum, [yKey]: yNum };
      })
      .filter((r): r is DataRow => r !== null)
      .slice(0, maxPoints * 2);
    return {
      rows: scatterRows,
      xKey,
      yKey,
      seriesKeys: [yKey],
      isColumnOrientation: false,
    };
  }

  const aggregation: AggregationMode = chart.aggregation || 'none';

  if (aggregation === 'none') {
    const plainRows = filtered.slice(0, maxPoints).map((row) => {
      const yNum = parseNumberSafely(row[yKey]);
      return {
        ...row,
        [xKey]: String(row[xKey]),
        [yKey]: Number.isFinite(yNum) ? yNum : 0,
      };
    });
    return {
      rows: plainRows,
      xKey,
      yKey,
      seriesKeys: [yKey],
      isColumnOrientation: false,
    };
  }

  // Group by X value
  const grouped = new Map<string, { sum: number; count: number }>();
  for (const row of filtered) {
    const xLabel = String(row[xKey]);
    const yNum = parseNumberSafely(row[yKey]);
    const entry = grouped.get(xLabel) || { sum: 0, count: 0 };
    if (aggregation === 'count') {
      entry.count += 1;
      entry.sum += 1;
    } else if (Number.isFinite(yNum)) {
      entry.sum += yNum;
      entry.count += 1;
    }
    grouped.set(xLabel, entry);
  }

  const aggregatedRows: DataRow[] = Array.from(grouped.entries())
    .slice(0, maxPoints)
    .map(([label, agg]) => {
      let value = 0;
      if (aggregation === 'sum') value = Number(agg.sum.toFixed(3));
      else if (aggregation === 'avg') value = agg.count > 0 ? Number((agg.sum / agg.count).toFixed(3)) : 0;
      else value = agg.count;
      return {
        [xKey]: label,
        [yKey]: value,
      };
    });

  return {
    rows: aggregatedRows,
    xKey,
    yKey,
    seriesKeys: [yKey],
    isColumnOrientation: false,
  };
};

export const buildLocalStatsSummaryForAI = (data: DataRow[], headers: string[]) => {
  return headers.slice(0, 18).map((header) => {
    const rawVals = data
      .map((row) => row[header])
      .filter((v) => v !== undefined && v !== null && v !== '');
    const numericVals = rawVals.map((v) => parseNumberSafely(v)).filter((n) => Number.isFinite(n));
    const isNumeric = numericVals.length > 0 && numericVals.length >= rawVals.length * 0.5;

    if (isNumeric) {
      const stats = calculateFullStats(numericVals);
      return {
        column: header,
        type: 'numeric' as const,
        count: numericVals.length,
        mean: stats ? Number(stats.mean.toFixed(4)) : null,
        median: stats ? Number(stats.median.toFixed(4)) : null,
        sum: stats ? Number(stats.sum.toFixed(2)) : null,
        stdDev: stats ? Number(stats.stdDev.toFixed(4)) : null,
        stdError: stats ? Number(stats.stdError.toFixed(4)) : null,
        cv: stats ? Number(stats.cv.toFixed(2)) : null,
        kurtosis: stats ? Number(stats.kurtosis.toFixed(4)) : null,
        skewness: stats ? Number(stats.skewness.toFixed(4)) : null,
        max: stats ? stats.max : null,
        min: stats ? stats.min : null,
        range: stats ? stats.range : null,
        ciLower: stats ? Number(stats.ciLower.toFixed(4)) : null,
        ciUpper: stats ? Number(stats.ciUpper.toFixed(4)) : null,
      };
    }

    const frequencies: Record<string, number> = {};
    rawVals.forEach((v) => {
      const str = String(v).trim();
      if (str) frequencies[str] = (frequencies[str] || 0) + 1;
    });
    const topValues = Object.entries(frequencies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));

    return {
      column: header,
      type: 'categorical' as const,
      count: rawVals.length,
      uniqueValuesCount: Object.keys(frequencies).length,
      topValues,
    };
  });
};
