# ruff: noqa
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters
from google.genai import types
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.models.llm_response import LlmResponse

import os
import google.auth

try:
    _, project_id = google.auth.default()
except Exception:
    project_id = None

os.environ["GOOGLE_CLOUD_PROJECT"] = project_id or os.environ.get("GOOGLE_CLOUD_PROJECT") or "massive-plasma-440513-s3"
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# Resolve absolute path to the specs directory
specs_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "specs"))

mcp_toolset = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="npx",
            args=["-y", "@modelcontextprotocol/server-filesystem", specs_dir],
        )
    )
)

class SafetyGuardrailPlugin(BasePlugin):
    """Safety plugin that scans model outputs for construction operations

    and ensures safety compliance guidelines are appended if not present.
    """
    def __init__(self):
        super().__init__(name="safety_guardrail")

    async def after_model_callback(self, *, callback_context, llm_response: LlmResponse):
        text = ""
        if llm_response.content and llm_response.content.parts:
            text = "".join([p.text for p in llm_response.content.parts if p.text])
        
        # Check if the output relates to construction operations
        is_construction = any(keyword in text.lower() for keyword in ["concrete", "steel", "welding", "electrical", "conduit", "wiring"])
        has_safety_mention = any(keyword in text.lower() for keyword in ["safety", "osha", "protection", "comply", "certified", "grounding", "harness", "warning"])
        
        if is_construction and not has_safety_mention:
            warning_text = (
                "\n\n> **OSHA Safety Compliance Notice**: Please ensure all site operations "
                "comply with OSHA standards, including the use of appropriate Personal Protective Equipment (PPE), "
                "proper grounding, and certified personnel."
            )
            # Append the safety text to the first part of the response
            llm_response.content.parts[0].text = text + warning_text
            
        return None

root_agent = Agent(
    name="root_agent",
    model=Gemini(
        model="gemini-flash-latest",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=(
        "You are a Subcontractor RFI & Submittal Assistant for a construction project. "
        "Subcontractors will ask you questions about building requirements, concrete mix designs, "
        "steel framing alignments, electrical materials, support spacing, etc. "
        "Your task is to search the project specifications using the filesystem tools available in your toolset "
        "(e.g., search for keywords, list files, and read files in the specs folder). "
        "Always locate the relevant specification section, read it carefully, and write a professional reply to the subcontractor. "
        "In your reply:\n"
        "1. Directly answer their question.\n"
        "2. Quote the exact specification section title, number, and relevant text (e.g., 'Per Section 03 30 00, Part 3.1...').\n"
        "3. Be precise and cite the exact values (e.g., psi strengths, temperature limits, support spacings).\n"
        "4. If the specifications do not cover their question, clearly state that the information is not found in the current project specs and suggest they contact the design engineer.\n"
        "5. Never make up or hallucinate values.\n\n"
        "Security Note: You only have access to the project's 'specs' directory. Do not try to read or modify files outside of this folder."
    ),
    tools=[mcp_toolset],
)

app = App(
    root_agent=root_agent,
    name="app",
    plugins=[SafetyGuardrailPlugin()],
)
