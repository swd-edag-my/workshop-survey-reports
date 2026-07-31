const form = document.querySelector("#report-form");
const fileInput = document.querySelector("#survey-files");
const titleInput = document.querySelector("#report-title");
const contextInput = document.querySelector("#report-context");
const generateButton = document.querySelector("#generate-button");
const status = document.querySelector("#form-status");
const results = document.querySelector("#results");
const resultTitle = document.querySelector("#results-title");
const resultContext = document.querySelector("#generated-context");
const disclosure = document.querySelector("#analysis-disclosure");
const summary = document.querySelector("#generated-summary");
const scoreList = document.querySelector("#score-list");
const cohortTable = document.querySelector("#cohort-table");
const questionTable = document.querySelector("#question-table");
const feedbackResults = document.querySelector("#feedback-results");
const feedbackThemes = document.querySelector("#feedback-themes");
const commentSummary = document.querySelector("#comment-summary");
const commentList = document.querySelector("#comment-list");
const methodList = document.querySelector("#method-list");
const profileResults = document.querySelector("#profile-results");
const profileFields = document.querySelector("#profile-fields");
const downloadButton = document.querySelector("#download-summary");
const printButton = document.querySelector("#print-report");

let currentAnalysis = null;

const stopWords = new Set([
  "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "but", "by", "can", "could", "did", "do", "for", "from", "good", "had", "has", "have", "helped", "how", "i", "if", "in", "is", "it", "learned", "me", "more", "my", "of", "on", "or", "our", "please", "really", "share", "so", "some", "that", "the", "their", "this", "to", "topic", "very", "was", "we", "well", "what", "with", "workshop", "would", "you", "your"
]);

const feedbackTags = [
  { label: "Hands-on / practice", expression: /hands[ -]?on|exercise|activit(?:y|ies)|practice|demonstrat|implementation|lab/i },
  { label: "Setup / prerequisites", expression: /prereq|setup|dependenc|install|package|version/i },
  { label: "Time / pacing", expression: /more time|time|pace|longer|shorter|duration/i },
  { label: "Reference materials", expression: /slide|cheat[ -]?sheet|reference|recording|material|resource/i },
  { label: "Clarity / organization", expression: /clear|explain|organis|organiz|follow|instruction/i },
  { label: "Practical value", expression: /daily|workflow|apply|relevant|role|useful|real situation/i }
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function parseCsv(source) {
  const text = source.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("A CSV file contains an unclosed quoted value.");
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => String(value).trim() !== ""));
}

function normalizeHeaders(headers) {
  return headers.map((header) => String(header).trim());
}

function schemaKey(headers) {
  return headers.map((header) => header.toLocaleLowerCase()).join("\u001f");
}

function isRatingValue(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" || (/^[1-5]$/.test(trimmed));
}

function identifyColumns(headers, dataRows) {
  const timestampIndex = headers.findIndex((header) => /timestamp|submitted|date/i.test(header));
  const ratingIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ index }) => {
      const values = dataRows.map((row) => String(row[index] ?? "").trim());
      return values.some(Boolean) && values.every(isRatingValue);
    })
    .map(({ index }) => index);

  if (!ratingIndexes.length) {
    throw new Error("No 1–5 rating columns were found. Check that the exported files use numeric rating values.");
  }

  const nonRatingIndexes = headers.map((_, index) => index).filter((index) => !ratingIndexes.includes(index));
  const namedFeedback = nonRatingIndexes.find((index) => /feedback|suggestion|comment|improve/i.test(headers[index]));
  const possibleTextIndexes = nonRatingIndexes.filter((index) => index !== timestampIndex);
  const likelyFreeText = possibleTextIndexes.filter((index) => {
    const values = dataRows.map((row) => String(row[index] ?? "").trim()).filter(Boolean);
    const distinctCount = new Set(values).size;
    return values.some((value) => value.length > 40 || /[.!?]/.test(value)) || distinctCount > Math.max(5, Math.ceil(values.length * 0.5));
  });
  const feedbackIndex = namedFeedback ?? likelyFreeText.at(-1) ?? null;
  const otherIndexes = nonRatingIndexes.filter((index) => index !== timestampIndex && index !== feedbackIndex);

  return { timestampIndex, ratingIndexes, feedbackIndex, otherIndexes };
}

function sourceLabel(fileName) {
  const stem = fileName.replace(/\.csv$/i, "").trim();
  const parenthetical = stem.match(/\(([^)]+)\)/);
  if (parenthetical?.[1]) return parenthetical[1].trim();
  return stem.replace(/^post[ -]?workshop(?:\s+survey)?/i, "").trim() || stem;
}

function parseDate(value) {
  const match = String(value ?? "").match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return null;
  const valueMean = average(values);
  const total = values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0);
  return Math.sqrt(total / (values.length - 1));
}

function modes(values) {
  if (!values.length) return [];
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const maximum = Math.max(...counts.values());
  return [...counts.entries()].filter(([, count]) => count === maximum).map(([value]) => value).sort();
}

function distribution(values) {
  return [1, 2, 3, 4, 5].reduce((counts, rating) => {
    counts[rating] = values.filter((value) => value === rating).length;
    return counts;
  }, {});
}

function formatScore(value) {
  return value === null ? "—" : value.toFixed(2);
}

function formatPercent(count, total) {
  return total ? `${((count / total) * 100).toFixed(1)}%` : "—";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function formatDateRange(dates) {
  const valid = dates.filter(Boolean).sort((left, right) => left - right);
  if (!valid.length) return "Submission date unavailable";
  if (valid[0].getTime() === valid.at(-1).getTime()) return formatDate(valid[0]);
  return `${formatDate(valid[0])}–${formatDate(valid.at(-1))}`;
}

function compactQuestion(question, position) {
  const compact = question.replace(/\s+/g, " ").replace(/[.?!]+$/, "").trim();
  const limit = 46;
  return `Q${position + 1} · ${compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact}`;
}

function analyse(parsedFiles, requestedTitle, requestedContext) {
  const headers = parsedFiles[0].headers;
  const allRows = parsedFiles.flatMap((file) => file.rows);
  const columns = identifyColumns(headers, allRows.map((entry) => entry.row));
  const ratingQuestions = columns.ratingIndexes.map((index) => ({ index, text: headers[index] }));

  const records = allRows.map(({ cohort, fileName, row }) => ({
    cohort,
    fileName,
    timestamp: columns.timestampIndex >= 0 ? String(row[columns.timestampIndex] ?? "").trim() : "",
    rawRow: row,
    date: columns.timestampIndex >= 0 ? parseDate(row[columns.timestampIndex]) : null,
    feedback: columns.feedbackIndex === null ? "" : String(row[columns.feedbackIndex] ?? "").trim(),
    scores: columns.ratingIndexes.map((index) => {
      const raw = String(row[index] ?? "").trim();
      return raw === "" ? null : Number(raw);
    })
  }));

  const questionStats = ratingQuestions.map((question, position) => {
    const values = records.map((record) => record.scores[position]).filter((value) => Number.isInteger(value));
    const counts = distribution(values);
    const positive = counts[4] + counts[5];
    const neutral = counts[3];
    const negative = counts[1] + counts[2];
    return {
      ...question,
      position,
      label: compactQuestion(question.text, position),
      values,
      n: values.length,
      missing: records.length - values.length,
      mean: average(values),
      median: median(values),
      mode: modes(values),
      standardDeviation: sampleStandardDeviation(values),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      counts,
      positive,
      neutral,
      negative
    };
  });

  const profileCandidates = columns.otherIndexes.map((index) => {
    const values = records.map((record) => String(record.rawRow[index] ?? "").trim()).filter(Boolean);
    const distinct = new Set(values);
    const likelyFreeText = distinct.size > Math.max(12, Math.ceil(values.length * 0.72));
    const isMultiSelect = values.length > 0 && values.filter((value) => /[,;]/.test(value)).length / values.length >= 0.3;
    const frequencyValues = isMultiSelect
      ? values.flatMap((value) => value.split(/\s*[;,]\s*/).map((item) => item.trim()).filter(Boolean))
      : values;
    const counts = new Map();
    frequencyValues.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return {
      header: headers[index],
      responseCount: values.length,
      missing: records.length - values.length,
      isMultiSelect,
      likelyFreeText,
      categories: [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    };
  });
  const profileFields = profileCandidates.filter((field) => !field.likelyFreeText);
  const freeTextFields = profileCandidates.filter((field) => field.likelyFreeText).map((field) => field.header);

  const allRatings = questionStats.flatMap((question) => question.values);
  const cohorts = parsedFiles.map((file) => {
    const group = records.filter((record) => record.fileName === file.fileName);
    const responseAverages = group
      .map((record) => average(record.scores.filter((score) => Number.isInteger(score))))
      .filter((value) => value !== null);
    const groupRatings = group.flatMap((record) => record.scores.filter((score) => Number.isInteger(score)));
    return {
      label: file.cohort,
      n: group.length,
      dateRange: formatDateRange(group.map((record) => record.date)),
      compositeMean: average(responseAverages),
      compositeMedian: median(responseAverages),
      positive: groupRatings.filter((rating) => rating >= 4).length,
      ratingCount: groupRatings.length
    };
  });

  const comments = records
    .filter((record) => record.feedback)
    .map((record) => ({ cohort: record.cohort, text: record.feedback }));
  const tagCounts = feedbackTags.map((tag) => ({
    ...tag,
    count: comments.filter((comment) => tag.expression.test(comment.text)).length
  }));
  const termCounts = new Map();
  comments.forEach((comment) => {
    const words = comment.text.toLocaleLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
    words.forEach((word) => {
      if (!stopWords.has(word)) termCounts.set(word, (termCounts.get(word) ?? 0) + 1);
    });
  });
  const topTerms = [...termCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10);

  const rankedQuestions = [...questionStats].sort((left, right) => (right.mean ?? -Infinity) - (left.mean ?? -Infinity));
  const topQuestions = rankedQuestions.filter((question) => question.mean === rankedQuestions[0].mean);
  const lowQuestion = rankedQuestions.at(-1);
  const allDistribution = distribution(allRatings);
  const overallPositive = allDistribution[4] + allDistribution[5];
  const expectedRatings = records.length * ratingQuestions.length;
  const missingRatings = expectedRatings - allRatings.length;
  const title = requestedTitle.trim() || "Post-workshop survey report";
  const context = requestedContext.trim();

  return {
    title,
    context,
    records,
    headers,
    columns,
    questionStats,
    cohorts,
    profileFields,
    freeTextFields,
    comments,
    tagCounts,
    topTerms,
    respondentCount: records.length,
    questionCount: ratingQuestions.length,
    allRatings,
    allDistribution,
    overallMean: average(allRatings),
    overallMedian: median(allRatings),
    overallMode: modes(allRatings),
    overallStandardDeviation: sampleStandardDeviation(allRatings),
    overallPositive,
    expectedRatings,
    missingRatings,
    dateRange: formatDateRange(records.map((record) => record.date)),
    topQuestions,
    lowQuestion
  };
}

function renderTable(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderAnalysis(analysis) {
  currentAnalysis = analysis;
  resultTitle.textContent = analysis.title;
  resultContext.textContent = [analysis.context, analysis.dateRange, `${analysis.respondentCount} response${analysis.respondentCount === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");

  disclosure.innerHTML = `<strong>Browser-only report.</strong> ${analysis.respondentCount} response rows from ${analysis.cohorts.length} selected file${analysis.cohorts.length === 1 ? "" : "s"} were processed locally. Nothing has been uploaded.`;
  const bestLabels = analysis.topQuestions.map((question) => escapeHtml(question.label.replace(/^Q\d+ · /, ""))).join(" and ");
  summary.innerHTML = `<p><strong>${formatScore(analysis.overallMean)} / 5</strong> is the overall mean across ${analysis.allRatings.length} available ratings. ${formatPercent(analysis.overallPositive, analysis.allRatings.length)} are positive (4–5). The highest relative score is <strong>${bestLabels}</strong>; the main relative focus area is <strong>${escapeHtml(analysis.lowQuestion.label.replace(/^Q\d+ · /, ""))}</strong> at ${formatScore(analysis.lowQuestion.mean)} / 5.</p>`;

  scoreList.innerHTML = [...analysis.questionStats]
    .sort((left, right) => (right.mean ?? -Infinity) - (left.mean ?? -Infinity))
    .map((question) => {
      const width = question.mean === null ? 0 : Math.max(0, Math.min(100, question.mean * 20));
      return `<div class="score-row" title="${escapeHtml(question.text)}"><span class="score-label">${escapeHtml(question.label)}</span><div class="score-track" aria-hidden="true"><div class="score-fill" style="width:${width}%"></div></div><span class="score-value">${formatScore(question.mean)} / 5</span></div>`;
    })
    .join("");

  cohortTable.innerHTML = renderTable(
    ["Cohort", "Responses", "Submission dates", "Composite mean", "Positive ratings"],
    analysis.cohorts.map((cohort) => `<tr><td class="table-emphasis">${escapeHtml(cohort.label)}</td><td>${cohort.n}</td><td>${escapeHtml(cohort.dateRange)}</td><td>${formatScore(cohort.compositeMean)} / 5</td><td>${formatPercent(cohort.positive, cohort.ratingCount)}</td></tr>`)
  );

  if (analysis.profileFields.length) {
    profileResults.hidden = false;
    profileFields.innerHTML = analysis.profileFields.map((field) => {
      const shownCategories = field.categories.slice(0, 10);
      const denominator = field.isMultiSelect ? analysis.respondentCount : field.responseCount;
      const fieldType = field.isMultiSelect ? "Multiple selections; percentages use all response rows." : `Responses: ${field.responseCount}; missing: ${field.missing}.`;
      const remainder = field.categories.length - shownCategories.length;
      return `<article class="profile-field"><h4>${escapeHtml(field.header)}</h4><p>${fieldType}</p><ul>${shownCategories.map(([value, count]) => `<li><span>${escapeHtml(value)}</span><strong>${count} (${formatPercent(count, denominator)})</strong></li>`).join("")}${remainder > 0 ? `<li><span>Other categories</span><strong>${remainder} more</strong></li>` : ""}</ul></article>`;
    }).join("");
  } else {
    profileResults.hidden = true;
  }

  questionTable.innerHTML = renderTable(
    ["Question", "n", "Mean", "Median", "Mode", "SD", "Range", "5", "4", "3", "2", "1", "Positive", "Neutral", "Negative", "Missing"],
    analysis.questionStats.map((question) => `<tr><td title="${escapeHtml(question.text)}"><span class="table-emphasis">Q${question.position + 1}</span> ${escapeHtml(question.text)}</td><td>${question.n}</td><td>${formatScore(question.mean)}</td><td>${formatScore(question.median)}</td><td>${escapeHtml(question.mode.join(" / ") || "—")}</td><td>${formatScore(question.standardDeviation)}</td><td>${question.min === null ? "—" : `${question.min}–${question.max}`}</td><td>${question.counts[5]} (${formatPercent(question.counts[5], question.n)})</td><td>${question.counts[4]} (${formatPercent(question.counts[4], question.n)})</td><td>${question.counts[3]} (${formatPercent(question.counts[3], question.n)})</td><td>${question.counts[2]} (${formatPercent(question.counts[2], question.n)})</td><td>${question.counts[1]} (${formatPercent(question.counts[1], question.n)})</td><td>${formatPercent(question.positive, question.n)}</td><td>${formatPercent(question.neutral, question.n)}</td><td>${formatPercent(question.negative, question.n)}</td><td>${question.missing}</td></tr>`)
  );

  if (analysis.comments.length) {
    feedbackResults.hidden = false;
    const matchedTags = analysis.tagCounts.filter((tag) => tag.count > 0);
    feedbackThemes.innerHTML = matchedTags.length
      ? `<ul class="theme-list">${matchedTags.map((tag) => `<li><span>${escapeHtml(tag.label)}</span><strong>${tag.count} (${formatPercent(tag.count, analysis.comments.length)})</strong></li>`).join("")}</ul>${analysis.topTerms.length ? `<p class="block-intro">Common terms: ${analysis.topTerms.map(([term, count]) => `${escapeHtml(term)} (${count})`).join(", ")}</p>` : ""}`
      : `<p class="block-intro">No configured action phrases were found. Review the comments directly for context.</p>`;
    commentSummary.textContent = `Review ${analysis.comments.length} written comment${analysis.comments.length === 1 ? "" : "s"} locally`;
    commentList.innerHTML = analysis.comments.map((comment) => `<li><strong>${escapeHtml(comment.cohort)}:</strong> ${escapeHtml(comment.text)}</li>`).join("");
  } else {
    feedbackResults.hidden = true;
  }

  const dateAvailability = analysis.columns.timestampIndex >= 0 ? `Submission dates: ${analysis.dateRange}.` : "No timestamp column was detected.";
  methodList.innerHTML = [
    `${analysis.respondentCount} response rows; ${analysis.questionCount} detected 1–5 rating question${analysis.questionCount === 1 ? "" : "s"}.`,
    `${analysis.allRatings.length} of ${analysis.expectedRatings} expected rating cells are present; ${analysis.missingRatings} are missing.`,
    "For reporting, 4–5 are classified as positive, 3 as neutral, and 1–2 as negative. Confirm original scale anchors before external publication.",
    dateAvailability,
    "Filename labels are descriptive cohorts only; they are not treated as departments, teams, or facilitators.",
    "Response rate cannot be calculated without an eligible or invited-attendee denominator.",
    ...(analysis.profileFields.length ? [`${analysis.profileFields.length} additional categorical field${analysis.profileFields.length === 1 ? "" : "s"} summarized above.`] : []),
    ...(analysis.freeTextFields.length ? [`Not summarized as categories because they appear to be free text: ${analysis.freeTextFields.map(escapeHtml).join(", ")}.`] : []),
    ...(analysis.comments.length ? ["Feedback phrase tags are automated orientation cues. Read written comments before assigning sentiment or making a decision."] : [])
  ].map((item) => `<li>${item}</li>`).join("");

  results.hidden = false;
  results.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  resultTitle.focus({ preventScroll: true });
}

function quoteCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadSummary() {
  if (!currentAnalysis) return;
  const rows = [
    ["Report", currentAnalysis.title],
    ["Response rows", currentAnalysis.respondentCount],
    ["Overall mean", formatScore(currentAnalysis.overallMean)],
    ["Positive ratings", formatPercent(currentAnalysis.overallPositive, currentAnalysis.allRatings.length)],
    [],
    ["Question", "Mean", "Median", "Mode", "Sample SD", "Responses", "Positive", "Neutral", "Negative", "Missing"]
  ];
  currentAnalysis.questionStats.forEach((question) => {
    rows.push([
      question.text,
      formatScore(question.mean),
      formatScore(question.median),
      question.mode.join(" / "),
      formatScore(question.standardDeviation),
      question.n,
      formatPercent(question.positive, question.n),
      formatPercent(question.neutral, question.n),
      formatPercent(question.negative, question.n),
      question.missing
    ]);
  });
  rows.push([], ["Cohort", "Responses", "Composite mean", "Positive ratings"]);
  currentAnalysis.cohorts.forEach((cohort) => rows.push([cohort.label, cohort.n, formatScore(cohort.compositeMean), formatPercent(cohort.positive, cohort.ratingCount)]));
  const blob = new Blob([rows.map((row) => row.map(quoteCsv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentAnalysis.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "survey-report"}-summary.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = [...fileInput.files];
  if (!files.length) {
    setStatus("Select at least one CSV file to generate a report.", "error");
    fileInput.focus();
    return;
  }

  try {
    generateButton.disabled = true;
    setStatus(`Reading ${files.length} file${files.length === 1 ? "" : "s"} locally…`);
    const parsedFiles = [];
    let expectedSchema = null;

    for (const file of files) {
      if (!/\.csv$/i.test(file.name)) throw new Error(`“${file.name}” is not a CSV file.`);
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error(`“${file.name}” has no response rows.`);
      const headers = normalizeHeaders(rows[0]);
      if (!headers.every(Boolean)) throw new Error(`“${file.name}” has an empty column header.`);
      const key = schemaKey(headers);
      if (expectedSchema && expectedSchema !== key) throw new Error(`“${file.name}” does not have the same columns and order as the first file.`);
      expectedSchema = key;
      const dataRows = rows.slice(1).map((row, rowIndex) => {
        if (row.length !== headers.length) throw new Error(`“${file.name}”, response row ${rowIndex + 2}, has ${row.length} cells instead of ${headers.length}.`);
        return { cohort: sourceLabel(file.name), fileName: file.name, row };
      });
      parsedFiles.push({ cohort: sourceLabel(file.name), fileName: file.name, headers, rows: dataRows });
    }

    const analysis = analyse(parsedFiles, titleInput.value, contextInput.value);
    renderAnalysis(analysis);
    setStatus(`Report generated from ${analysis.respondentCount} response rows. Your files stayed in this browser.`, "success");
  } catch (error) {
    results.hidden = true;
    setStatus(error instanceof Error ? error.message : "The report could not be generated.", "error");
  } finally {
    generateButton.disabled = false;
  }
});

fileInput.addEventListener("change", () => {
  const count = fileInput.files.length;
  if (count) setStatus(`${count} file${count === 1 ? "" : "s"} selected. Ready to generate locally.`);
});

downloadButton.addEventListener("click", downloadSummary);
printButton.addEventListener("click", () => window.print());
