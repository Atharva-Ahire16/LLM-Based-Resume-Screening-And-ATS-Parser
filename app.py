"""
ATS Hiring Agent - Web Dashboard
Serves both Individual and Recruiter dashboards.
Reuses the existing score.py pipeline (PDFHandler + ResumeEvaluator + transform).
"""

import os
import csv
import json
import logging
import tempfile
import threading
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename

# ── Project internals (reused as-is) ──────────────────────────────────────────
from score import main as evaluate_pdf, print_evaluation_results, _evaluate_resume, find_profile
from transform import transform_evaluation_response
from models import JSONResume
from config import DEVELOPMENT_MODE
from prompt import DEFAULT_MODEL, MODEL_PARAMETERS

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)5s - %(lineno)5d - %(funcName)33s - %(levelname)5s - %(message)s",
)
logger = logging.getLogger(__name__)

# ── Flask setup ───────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
UPLOAD_FOLDER = BASE_DIR / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

INDIVIDUAL_CSV = BASE_DIR / "individual_evaluations.csv"
RECRUITER_CSV  = BASE_DIR / "resume_evaluations.csv"      # existing file reused

ALLOWED_EXTENSIONS = {"pdf"}

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

# Mutex so concurrent uploads don't corrupt CSV files
_csv_lock = threading.Lock()


# ── Helpers ───────────────────────────────────────────────────────────────────

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _write_csv_row(csv_path: Path, row: dict) -> None:
    """Thread-safe CSV append."""
    with _csv_lock:
        file_exists = csv_path.exists()
        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(row.keys()))
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)


def _read_csv(csv_path: Path) -> list[dict]:
    """Return all rows from a CSV as a list of dicts."""
    if not csv_path.exists():
        return []
    with open(csv_path, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _compute_final_score(evaluation) -> float:
    """Replicate the score calculation from score.py:print_evaluation_results."""
    if not evaluation or not hasattr(evaluation, "scores"):
        return 0.0

    total = 0.0
    for _, cat in evaluation.scores.model_dump().items():
        total += min(cat["score"], cat["max"])

    if hasattr(evaluation, "bonus_points") and evaluation.bonus_points:
        total += evaluation.bonus_points.total
    if hasattr(evaluation, "deductions") and evaluation.deductions:
        total -= evaluation.deductions.total

    return round(total, 1)


def _evaluation_to_api_dict(evaluation, resume_data, github_data, pdf_filename) -> dict:
    """Convert evaluation result to a JSON-serialisable dict for API responses."""
    category_maxes = {
        "open_source": 35,
        "self_projects": 30,
        "production": 25,
        "technical_skills": 10,
    }

    scores_dict = {}
    if evaluation and hasattr(evaluation, "scores"):
        for cat_name, cat_data in evaluation.scores.model_dump().items():
            scores_dict[cat_name] = {
                "score": min(cat_data["score"], category_maxes.get(cat_name, cat_data["max"])),
                "max": cat_data["max"],
                "evidence": cat_data["evidence"],
            }

    candidate_name = pdf_filename.replace(".pdf", "")
    if resume_data and resume_data.basics and resume_data.basics.name:
        candidate_name = resume_data.basics.name

    return {
        "candidate_name": candidate_name,
        "file_name": pdf_filename,
        "final_score": _compute_final_score(evaluation),
        "max_score": 100,
        "scores": scores_dict,
        "bonus_points": evaluation.bonus_points.total if evaluation and hasattr(evaluation, "bonus_points") else 0,
        "bonus_breakdown": evaluation.bonus_points.breakdown if evaluation and hasattr(evaluation, "bonus_points") else "",
        "deductions": evaluation.deductions.total if evaluation and hasattr(evaluation, "deductions") else 0,
        "deduction_reasons": evaluation.deductions.reasons if evaluation and hasattr(evaluation, "deductions") else "",
        "key_strengths": evaluation.key_strengths if evaluation and hasattr(evaluation, "key_strengths") else [],
        "areas_for_improvement": evaluation.areas_for_improvement if evaluation and hasattr(evaluation, "areas_for_improvement") else [],
        "email": resume_data.basics.email if resume_data and resume_data.basics else "",
        "phone": resume_data.basics.phone if resume_data and resume_data.basics else "",
        "current_position": resume_data.work[0].position if resume_data and resume_data.work else "",
        "current_company": resume_data.work[0].name if resume_data and resume_data.work else "",
        "skills": [kw for s in (resume_data.skills or []) for kw in (s.keywords or [])][:15] if resume_data else [],
        "github_url": next((p.url for p in (resume_data.basics.profiles or []) if p.network and p.network.lower() == "github"), "") if resume_data and resume_data.basics else "",
    }


def _process_resume_pipeline(save_path: Path, filename: str, target_csv: Path) -> dict:
    """
    Executes the shared ATS evaluation pipeline:
    1. Loads from cache if DEVELOPMENT_MODE and cache exists.
    2. Otherwise extracts JSONResume from PDF via PDFHandler.
    3. Caches resume_data if DEVELOPMENT_MODE.
    4. Fetches and caches GitHub data if profile found.
    5. Evaluates with _evaluate_resume.
    6. Appends to target_csv.
    7. Returns serialisable API dictionary.
    """
    from score import is_valid_resume_data, _evaluate_resume, find_profile
    from pdf import PDFHandler
    from github import fetch_and_display_github_info

    resume_stem = Path(filename).stem
    cache_dir = BASE_DIR / "cache"
    cache_filename = cache_dir / f"resumecache_{resume_stem}.json"
    github_cache_filename = cache_dir / f"githubcache_{resume_stem}.json"

    resume_data = None
    if DEVELOPMENT_MODE and cache_filename.exists():
        try:
            cached_data = json.loads(cache_filename.read_text(encoding="utf-8"))
            loaded = JSONResume(**cached_data)
            if is_valid_resume_data(loaded):
                resume_data = loaded
                logger.info(f"Loaded cached resume from {cache_filename}")
        except Exception as ce:
            logger.warning(f"Invalid cache {cache_filename}: {ce}")

    if resume_data is None:
        pdf_handler = PDFHandler()
        resume_data = pdf_handler.extract_json_from_pdf(str(save_path))

        if resume_data is None or not is_valid_resume_data(resume_data):
            raise ValueError(
                "Could not extract resume data from PDF. Please ensure Ollama is running with the 'gemma3:4b' model (or check your LLM provider in .env)."
            )

        if DEVELOPMENT_MODE and is_valid_resume_data(resume_data):
            try:
                cache_dir.mkdir(exist_ok=True)
                cache_filename.write_text(
                    json.dumps(resume_data.model_dump(), indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
            except Exception as swe:
                logger.warning(f"Could not write resume cache: {swe}")

    # GitHub profile enrichment (best-effort)
    github_data = {}
    if DEVELOPMENT_MODE and github_cache_filename.exists():
        try:
            github_data = json.loads(github_cache_filename.read_text(encoding="utf-8"))
        except Exception:
            pass

    if not github_data:
        profiles = []
        if resume_data and resume_data.basics:
            profiles = resume_data.basics.profiles or []
        github_profile = find_profile(profiles, "Github")
        if github_profile:
            try:
                github_data = fetch_and_display_github_info(github_profile.url) or {}
                if DEVELOPMENT_MODE and github_data:
                    cache_dir.mkdir(exist_ok=True)
                    github_cache_filename.write_text(
                        json.dumps(github_data, indent=2, ensure_ascii=False),
                        encoding="utf-8",
                    )
            except Exception as ge:
                logger.warning(f"GitHub fetch failed: {ge}")

    # Evaluate
    evaluation = _evaluate_resume(resume_data, github_data)
    if not evaluation:
        raise ValueError("AI evaluation produced no result. Please try again.")

    # Save to CSV
    csv_row = transform_evaluation_response(
        file_name=filename,
        evaluation=evaluation,
        resume_data=resume_data,
        github_data=github_data,
    )
    _write_csv_row(target_csv, csv_row)

    return _evaluation_to_api_dict(evaluation, resume_data, github_data, filename)


# ── Routes: pages ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/individual")
def individual_page():
    return render_template("individual.html")


@app.route("/recruiter")
def recruiter_page():
    return render_template("recruiter.html")


# ── Routes: Individual API ─────────────────────────────────────────────────────

@app.route("/api/individual/upload", methods=["POST"])
def individual_upload():
    """
    Accepts a PDF upload, runs the full ATS pipeline,
    saves to individual_evaluations.csv, returns JSON results.
    """
    if "resume" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["resume"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Only PDF files are allowed"}), 400

    filename = secure_filename(file.filename)
    save_path = UPLOAD_FOLDER / filename
    file.save(str(save_path))

    try:
        result = _process_resume_pipeline(save_path, filename, INDIVIDUAL_CSV)
        return jsonify({"success": True, "data": result})
    except Exception as e:
        logger.error(f"Individual upload error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 422
    finally:
        save_path.unlink(missing_ok=True)


@app.route("/api/individual/history", methods=["GET"])
def individual_history():
    """Return all past individual evaluations from individual_evaluations.csv."""
    rows = _read_csv(INDIVIDUAL_CSV)
    return jsonify(rows)


# ── Routes: Recruiter API ──────────────────────────────────────────────────────

@app.route("/api/recruiter/upload", methods=["POST"])
def recruiter_upload():
    """
    Accepts single or multiple PDF uploads on the recruiter side,
    runs the full pipeline, saves to resume_evaluations.csv (existing).
    """
    files = request.files.getlist("resumes") or request.files.getlist("resume")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No file uploaded"}), 400

    results = []
    errors = []

    for file in files:
        if not file or file.filename == "":
            continue
        if not allowed_file(file.filename):
            errors.append({"file": file.filename, "error": "Only PDF files are allowed"})
            continue

        filename = secure_filename(file.filename)
        save_path = UPLOAD_FOLDER / filename
        file.save(str(save_path))

        try:
            result = _process_resume_pipeline(save_path, filename, RECRUITER_CSV)
            results.append(result)
        except Exception as e:
            logger.error(f"Recruiter upload error for {filename}: {e}", exc_info=True)
            errors.append({"file": filename, "error": str(e)})
        finally:
            save_path.unlink(missing_ok=True)

    if not results and errors:
        return jsonify({
            "success": False,
            "error": errors[0]["error"],
            "errors": errors,
        }), 422

    return jsonify({
        "success": True,
        "data": results[0] if results else None,
        "results": results,
        "errors": errors,
        "total_processed": len(results),
        "total_failed": len(errors),
    })


@app.route("/api/recruiter/data", methods=["GET"])
def recruiter_data():
    """Return all recruiter evaluations from resume_evaluations.csv as JSON."""
    rows = _read_csv(RECRUITER_CSV)
    return jsonify(rows)


@app.route("/api/recruiter/download", methods=["GET"])
def recruiter_download():
    """Download the full recruiter CSV."""
    return send_from_directory(
        directory=str(BASE_DIR),
        path="resume_evaluations.csv",
        as_attachment=True,
        download_name="recruiter_evaluations.csv",
    )


@app.route("/api/individual/download", methods=["GET"])
def individual_download():
    """Download the individual evaluations CSV."""
    if not INDIVIDUAL_CSV.exists():
        return jsonify({"error": "No data yet"}), 404
    return send_from_directory(
        directory=str(BASE_DIR),
        path="individual_evaluations.csv",
        as_attachment=True,
        download_name="individual_evaluations.csv",
    )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)
