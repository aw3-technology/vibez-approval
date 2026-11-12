"""An OpenAI Agents SDK agent whose shell tool waits for your approval on Vibez.now.

    pip install openai-agents
    VIBEZ_API_KEY=... OPENAI_API_KEY=... python examples/python/openai_agents_agent.py

Written for openai-agents 0.24 (checked against its docs in November 2026). Don't set a `timeout=` on the tool shorter
than the approval window, or the SDK gives up before the person answers.
"""

import asyncio

from agents import Agent, Runner, function_tool

from vibez_approval import ask_human


@function_tool
async def run_command(command: str) -> str:
    """Run a shell command. A person approves every command before it runs.

    Args:
        command: The shell command to run.
    """
    if not await ask_human(f"Run: {command[:80]}", command, source="openai-agents"):
        return f'Not approved: "{command}" was not run.'
    proc = await asyncio.create_subprocess_shell(
        command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    out, _ = await proc.communicate()
    return out.decode()


agent = Agent(
    name="Ops",
    instructions="Use run_command when you need the shell.",
    tools=[run_command],
)


async def main():
    result = await Runner.run(agent, "How much disk space is free here?")
    print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
