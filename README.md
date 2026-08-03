# Workshop Survey Reports

A static GitHub Pages site for two related jobs:

1. **Publishing reviewed, aggregate post-workshop reports** for stakeholders.
2. **Generating a new report locally in the browser** from compatible Google Forms CSV exports.

> **Privacy default:** files selected in the generator are processed in the visitor's browser. They are not uploaded to GitHub Pages, this repository, or another service.

## Live site

After the first successful GitHub Pages workflow run, the site is available at:

- <https://swd-edag-my.github.io/workshop-survey-reports/>

The initial published report is available under `site/reports/post-workshop-2026/`. It is an executive summary of the three post-workshop surveys (facilitators: Farihim, Hafiezul, and Sheue Shin, June–July 2026), presenting key insights and recommendations for future workshop facilitators in an aggregated, anonymized form. Raw response exports are intentionally excluded from this public repository.

## Use the report generator

1. Open the live site or run it locally.
2. Select one or more CSV files exported from the **same Google Form**.
3. Optionally add a report title and context note.
4. Select **Generate report**.
5. Review the results locally, then print/save as PDF or download the summary CSV.

The generator detects numeric 1–5 rating columns, combines matching files, preserves filename-derived cohorts, summarizes categorical profile fields when present (for example department, team, location, and AI-tool questions), computes question distributions and summary statistics, and provides a local written-feedback review aid.

### Compatibility rules

- All selected files must have the same header row and column order.
- Rating columns must contain only numeric values `1` through `5` (or be blank when a response is missing).
- A timestamp column is optional but improves date-range reporting.
- A feedback/comment/suggestion column is optional. A clearly named column is preferred; otherwise the tool uses a likely free-text column when one can be detected.
- The generator is intended for immediate post-workshop survey analysis. It does not calculate response rate without an invited/eligible-attendee denominator, and it does not infer demographics or AI adoption when those fields are absent.

## Publish a new reviewed report

The browser generator is deliberately private and does not commit user data. To add a report to the public site:

1. Review the source data and create an **aggregate/anonymized** report locally.
2. Add only approved public artifacts under `site/reports/<report-slug>/`.
3. Do **not** commit raw CSV exports, timestamps linked to comments, respondent identifiers, or unreviewed feedback.
4. Add a link and short summary to `site/index.html`.
5. Open a pull request or push to `main`; GitHub Actions deploys `site/` to Pages.

## Run locally

No build step or dependency installation is required.

```bash
python3 -m http.server 8080 --directory site
```

Then open <http://localhost:8080>.

## Deploy

The [GitHub Pages workflow](.github/workflows/deploy-pages.yml) deploys the `site/` directory on pushes to `main` and via manual dispatch. Repository Pages must use the **GitHub Actions** source (rather than branch deployment).

## Quality and accessibility

- Semantic HTML, keyboard-visible focus states, responsive tables, and reduced-motion support.
- Target: WCAG 2.2 AA.
- Charts do not rely on color alone; values and labels are written in text.
- Automated feedback tags are orientation aids only. Review written comments before assigning sentiment or presenting themes as conclusions.

## Repository structure

```text
site/
  index.html                         # Public report portal and local generator
  assets/
    styles.css
    app.js
  reports/
    post-workshop-2026/              # Approved public aggregate report
.github/workflows/deploy-pages.yml   # Static Pages deployment
PRODUCT.md                           # Product and governance context
```

## Data governance

This is a public repository. Treat anything committed here as public. The existing published report intentionally omits raw response exports. Keep the static site focused on reviewed, aggregated, and anonymized content.
