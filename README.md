# 📚 AI Study & Research Assistant

A simple Streamlit app powered by CrewAI. It can:
- Search & summarize a topic
- Explain a topic in simple terms
- Generate 5 study questions

## Files
- `app.py`: Streamlit app with CrewAI agent, tasks, and DuckDuckGo tool.
- `requirements.txt`: Python dependencies.

## Setup
1. Create a virtual environment (recommended) and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Set your LLM provider API key.
   - Google AI Studio (Gemini) [current default in app.py]:
     - PowerShell (Windows):
       ```powershell
       setx GOOGLE_API_KEY "YOUR_GEMINI_KEY"
       ```
     - macOS/Linux (bash):
       ```bash
       export GOOGLE_API_KEY="YOUR_GEMINI_KEY"
       ```
     - Model used: `gemini/gemini-1.5-pro` (you can switch to `gemini/gemini-1.5-flash` in `app.py` for lower cost).

   - OpenAI (optional alternative):
     - PowerShell (Windows):
       ```powershell
       setx OPENAI_API_KEY "YOUR_KEY"
       ```
     - macOS/Linux (bash):
       ```bash
       export OPENAI_API_KEY="YOUR_KEY"
       ```

3. Run the app:
   ```bash
   streamlit run app.py
   ```

## Notes
- The app uses CrewAI's `LLM(model="gemini/gemini-1.5-pro")` by default. Adjust the model string in `app.py` if needed.
- The built-in `web_search` tool calls DuckDuckGo's public API for lightweight context.
- If you face version issues, check your installed `crewai` version:
  ```bash
  pip show crewai
  ```
  And update the code or requirement versions accordingly.
