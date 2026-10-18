# ATS Hiring Agent

An automated resume evaluation engine that scores developer resumes by combining PDF text extraction, live GitHub activity analysis, and LLM-based rubric scoring.

Instead of matching shallow keywords like legacy ATS tools, this pipeline parses the resume into structured JSON sections, inspects the candidate's public GitHub repositories to verify actual code contributions, and scores them against a weighted rubric (Open Source, Personal Projects, Production Experience, and Core Skills).

It includes both a command-line pipeline and a Flask web dashboard with dedicated portals for individual applicants and recruiters.

---

## What It Does

1. **PDF Parsing**: Reads resume PDFs via PyMuPDF and converts them into structured Markdown, with automatic fallback for complex layouts.
2. **Section Extraction**: Uses Jinja2 prompt templates to extract discrete sections (Basics, Work, Education, Skills, Projects, Awards) into a typed Pydantic `JSONResume` object.
3. **GitHub Verification**: If a GitHub link is present, fetches public repos, commit counts, languages, and star counts, then selects the top relevant projects where the candidate is an actual contributor.
4. **Weighted Rubric Scoring**: Evaluates the candidate out of 100 points (plus bonus and deduction modifiers) with evidence citations for every category.
5. **Dual Dashboards**:
   - **Individual Portal (`/individual`)**: Single resume upload for candidates to check their ATS score, strengths, weak spots, and improvement tips.
   - **Recruiter Dashboard (`/recruiter`)**: Batch upload multiple resumes at once with live evaluation progress, candidate comparison charts, sortable data table, candidate drilldown drawer, and CSV export.
6. **Data Persistence**: Automatically logs evaluations into separate CSV files (`resume_evaluations.csv` and `individual_evaluations.csv`).

---

## Scoring Breakdown

Candidates are evaluated across four weighted categories totaling 100 base points:

| Category | Max Score | What is Evaluated |
|---|---|---|
| **Open Source** | 35 | Real contributions to public repos, merged PRs, community tooling, and commit frequency. |
| **Self Projects** | 30 | Scope, originality, architecture, deployment status, and technical depth of independent projects. |
| **Production Experience** | 25 | Professional work history, scale of systems built, business impact, and engineering responsibility. |
| **Technical Skills** | 10 | Breadth and depth of languages, frameworks, databases, and relevant developer tooling. |

- **Bonus Points (up to +20)**: Awarded for exceptional signals (e.g. hackathon wins, top-tier open source contributions, impactful production deployments).
- **Deductions**: Subtracted for inflated claims, empty repositories, or misattributed project ownership.
- **Maximum Possible Score**: Capped at 120 points.

---

## Project Structure

```text
.
├── app.py                      # Flask web application & API endpoints
├── score.py                    # CLI pipeline runner
├── pdf.py                      # PDF parsing & LLM section extractor
├── pymupdf_rag.py              # PyMuPDF markdown converter
├── github.py                   # GitHub API fetching & project ranking
├── evaluator.py                # Rubric evaluation engine
├── transform.py                # Schema transformation & CSV row formatting
├── models.py                   # Pydantic data models & LLM provider classes
├── llm_utils.py                # Provider initialization & response sanitization
├── prompt.py                   # Model parameters & provider mappings
├── config.py                   # Global configs (e.g. DEVELOPMENT_MODE caching)
├── requirements.txt            # Python dependencies
├── .env.example                # Environment variable template
├── prompts/
│   ├── template_manager.py     # Jinja2 template loader
│   └── templates/              # Extraction and evaluation prompt templates
├── templates/
│   ├── index.html              # Mode selector landing page
│   ├── individual.html         # Candidate self-check portal
│   └── recruiter.html          # Recruiter analytics dashboard
├── static/
│   ├── style.css               # Dashboard styling
│   ├── main.js                 # Landing page interactions
│   ├── individual.js           # Candidate upload & score visualizer
│   └── recruiter.js            # Batch upload manager & Chart.js renderer
├── cache/                      # Local JSON cache for fast re-runs (dev mode)
└── uploads/                    # Temporary staging for uploaded PDFs
```

---

## Quickstart

### 1. Prerequisites

- Python 3.11 or higher
- One of the following LLM providers:
  - **Ollama** (free, runs locally on your machine)
  - **Google Gemini API** (cloud-based, requires an API key)

### 2. Environment Setup

Clone the repository and set up a virtual environment:

```bash
# Clone the repository
git clone <repo-url>
cd hiring-agent

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure `.env`

Copy the sample environment file:

```bash
cp .env.example .env
```

Open `.env` and set your preferred provider:

#### Option A: Local with Ollama (Recommended default)
1. Install [Ollama](https://ollama.com/) and make sure it is running.
2. Pull the default model:
   ```bash
   ollama pull gemma3:4b
   ```
3. In `.env`:
   ```env
   LLM_PROVIDER=ollama
   DEFAULT_MODEL=gemma3:4b
   ```

#### Option B: Google Gemini
1. Get an API key from [Google AI Studio](https://aistudio.google.com/).
2. In `.env`:
   ```env
   LLM_PROVIDER=gemini
   DEFAULT_MODEL=gemini-2.5-flash
   GEMINI_API_KEY=your_actual_api_key_here
   ```

*(Optional)* If you hit GitHub API rate limits while checking candidate profiles, add your personal GitHub token in your environment:
```bash
export GITHUB_TOKEN="ghp_your_token_here"   # Linux/macOS
$env:GITHUB_TOKEN="ghp_your_token_here"    # Windows PowerShell
```

---

## Running the Application

### Method 1: Web Dashboard

Start the Flask server:

```bash
python app.py
```

Then open your browser at `http://localhost:5000`:

- **Landing Page (`/`)**: Choose between Individual or Recruiter mode.
- **Individual Check (`/individual`)**: Drop a single PDF resume to see your score ring, category breakdown, key strengths, and areas to improve. Results save to `individual_evaluations.csv`.
- **Recruiter Dashboard (`/recruiter`)**: Batch upload multiple resumes simultaneously via drag-and-drop. Features live evaluation progress per file, average & top score metric cards, score distribution bar chart, category radar chart, candidate search/sorting, detail drawer, and CSV export (`resume_evaluations.csv`).

### Method 2: Command Line (CLI)

To evaluate a single resume directly from your terminal:

```bash
python score.py path/to/candidate_resume.pdf
```

The script will:
1. Parse the PDF and extract JSON resume sections.
2. Query GitHub for the candidate's repositories (if profile found).
3. Run the evaluation rubric and print a formatted summary report to stdout.
4. If `DEVELOPMENT_MODE = True` in `config.py`, cache the parsed JSON to `cache/` and append the results to `resume_evaluations.csv`.

---

## Development & Caching

In `config.py`:
```python
DEVELOPMENT_MODE = True
```

When enabled:
- Intermediate extraction results are saved under `cache/resumecache_<filename>.json`.
- Fetched GitHub profiles are saved under `cache/githubcache_<filename>.json`.
- Subsequent runs on the same resume load instantly from cache, avoiding repeated LLM and GitHub API calls during local testing.
- Set `DEVELOPMENT_MODE = False` in production to force live extraction every time.

---

## Troubleshooting & Tips

- **Ollama connection issues**: Ensure Ollama is running (`ollama serve`) before starting an upload. You can verify installed models with `ollama list`.
- **Model not found error**: Run `ollama pull gemma3:4b` (or whichever model name is specified in your `.env`).
- **Slow extraction on CPU**: If running large models on CPU, try smaller variants like `gemma3:1b` or switch to `gemini-2.5-flash` in `.env` for sub-5-second cloud evaluations.
- **Upload errors on Windows**: If PowerShell blocks script activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in your active terminal.

---

## License

MIT License. See [LICENSE](./LICENSE) for details.
