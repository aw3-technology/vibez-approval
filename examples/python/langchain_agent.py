"""A LangChain agent whose shell tool waits for your approval on Vibez.now.

    pip install langchain langchain-anthropic
    VIBEZ_API_KEY=... ANTHROPIC_API_KEY=... python examples/python/langchain_agent.py

Written for langchain 1.4 (checked against its docs in November 2026). `create_agent` replaces LangGraph's deprecated
`create_react_agent`.
"""

import asyncio

from langchain.agents import create_agent
from langchain.tools import tool

from vibez_approval import ask_human


@tool
async def run_command(command: str) -> str:
    """Run a shell command. A person approves every command before it runs."""
    if not await ask_human(f"Run: {command[:80]}", command, source="langchain-agent"):
        return f'Not approved: "{command}" was not run.'
    proc = await asyncio.create_subprocess_shell(
        command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    out, _ = await proc.communicate()
    return out.decode()


agent = create_agent(model="anthropic:claude-sonnet-5-5", tools=[run_command])


async def main():
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "How much disk space is free here?"}]}
    )
    print(result["messages"][-1].content)


if __name__ == "__main__":
    asyncio.run(main())
