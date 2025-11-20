import os
import time
import streamlit as st
from crewai import Agent, Task, Crew, Process
from crewai.tools import tool
from crewai import LLM  # CrewAI's LLM wrapper
import requests

# -----------------------
# TOOL: Web Search Helper
# -----------------------
@tool("web_search")
def web_search_tool(topic: str):
    """Searches the web for information about a topic."""
    url = f"https://api.duckduckgo.com/?q={topic}&format=json"
    response = requests.get(url).json()
    abstract = response.get("Abstract", "")
    related = response.get("RelatedTopics", [])

    if abstract:
        return abstract
    if related:
        return related[0].get("Text", "No information found.")
    return "No information found online."

# -----------------------
# LLM (ensure your API key is set for the provider you use)
# For OpenAI models:
#   export OPENAI_API_KEY=...
# For Groq or others, set the appropriate env keys and model names.
# -----------------------
# Guard: ensure Google API key exists to avoid crashing during LLM init
_gemini_api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not _gemini_api_key:
    st.error(
        "Missing GOOGLE_API_KEY/GEMINI_API_KEY. Set it and restart the app.\n\n"
        "PowerShell (persist): setx GOOGLE_API_KEY \"YOUR_GEMINI_KEY\" (then reopen terminal)\n"
        "Current session only: $env:GOOGLE_API_KEY=\"YOUR_GEMINI_KEY\""
    )
    st.stop()

llm = LLM(model="gemini/gemini-2.5-flash")  # Switched per request

# -----------------------
# MAIN STUDY AGENT
# -----------------------
study_agent = Agent(
    role="AI Study & Research Assistant",
    goal="Help students research topics, explain concepts, and generate study materials.",
    backstory="An AI created to support student learning in a simple and helpful way.",
    tools=[web_search_tool],
    llm=llm,
    verbose=False,
    allow_delegation=False,
)

# -----------------------
# STREAMLIT UI
# -----------------------
st.set_page_config(page_title="AI Study Assistant", page_icon="📚")

st.title("📚 AI Study & Research Assistant")
st.write("Enter any topic and choose an action. The AI agent will help you learn smarter!")

topic = st.text_input("Enter your topic (example: Machine Learning, Solar Energy, OSI Model):")

choice = st.radio(
    "Choose an action:",
    ["Search & Summarize", "Explain Simply", "Generate Questions"]
)

if st.button("Run Agent"):
    if topic.strip() == "":
        st.warning("Please enter a topic.")
    else:
        with st.spinner("AI Agent is working..."):
            # Build a task based on the selected action
            if choice == "Search & Summarize":
                task = Task(
                    description=f"Search and summarize information about: {topic}",
                    expected_output="A clear, structured and short summary with important points.",
                    agent=study_agent,
                )
            elif choice == "Explain Simply":
                task = Task(
                    description=f"Explain the following topic in simple language: {topic}",
                    expected_output="A beginner-friendly explanation suitable for students.",
                    agent=study_agent,
                )
            else:  # Generate Questions
                task = Task(
                    description=f"Generate 5 important exam questions for: {topic}",
                    expected_output="A list of 5 well-formed, relevant questions.",
                    agent=study_agent,
                )

            crew = Crew(
                agents=[study_agent],
                tasks=[task],
                process=Process.sequential,
                verbose=False,
            )
            # Exponential backoff retry for transient 503/UNAVAILABLE errors
            max_attempts = 5
            base_delay = 1  # seconds
            result = None
            for attempt in range(1, max_attempts + 1):
                try:
                    result = crew.kickoff()
                    break
                except Exception as e:
                    msg = str(e)
                    is_503 = "503" in msg or "UNAVAILABLE" in msg or "model is overloaded" in msg
                    if is_503 and attempt < max_attempts:
                        sleep_s = base_delay * (2 ** (attempt - 1))
                        st.info(f"Model overloaded. Retrying in {sleep_s}s (attempt {attempt}/{max_attempts})…")
                        time.sleep(sleep_s)
                        continue
                    # Not retriable or out of attempts
                    raise
        st.success("Done!")
        st.write(result.raw if hasattr(result, "raw") else str(result))