import operator
from typing import TypedDict, Annotated, List
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition

# 1. IMPORT YOUR CUSTOM TOOL (The "Hands")
from tools import get_historical_prices

# ==========================================
# 2. DEFINE THE AGENT STATE (The "Memory")
# ==========================================
class AgentState(TypedDict):
    # 'Annotated' and 'operator.add' tell the graph to APPEND messages to the list, not overwrite them.
    # This creates the AI's short-term memory during the loop.
    messages: Annotated[List[BaseMessage], operator.add]
    ticker: str
    analysis_report: str

# ==========================================
# 3. INITIALIZE THE LLM & BIND TOOLS (The "Brain")
# ==========================================
# We use temperature=0 to force the AI to be deterministic and analytical, not creative.
llm = ChatGroq(model="openai/gpt-oss-20b", temperature=0)

# We explicitly give the LLM the instruction manual for your database functions
tools = [get_historical_prices]
llm_with_tools = llm.bind_tools(tools)

# ==========================================
# 4. DEFINE THE COMPUTATIONAL NODES
# ==========================================
def intelligence_node(state: AgentState):
    """
    The Brain Layer. 
    It looks at the current messages, decides if it needs to use a tool, or formulates an answer.
    """
    print("\n[NODE: INTELLIGENCE] 🧠 Agent is reasoning...")
    messages = state.get("messages", [])
    ticker = state.get("ticker")
    
    # The LLM processes the history. If it needs data, it will return a "ToolCall"
    response = llm_with_tools.invoke(messages)
    
    # We append the LLM's response to the memory
    return {"messages": [response]}

def reporting_node(state: AgentState):
    """
    The Output Layer.
    Extracts the final text from the LLM after it has finished all its tool queries.
    """
    print("\n[NODE: REPORTING] 📊 Finalizing alpha signal report...")
    final_message = state["messages"][-1].content
    return {"analysis_report": final_message}

# ==========================================
# 5. COMPILE THE AUTONOMOUS GRAPH
# ==========================================
workflow = StateGraph(AgentState)

# Register the logic nodes
workflow.add_node("agent", intelligence_node)
workflow.add_node("reporting", reporting_node)

# Register the Pre-Built Tool Node (This physically executes any tool the LLM requests)
workflow.add_node("tools", ToolNode(tools))

# Map the Directed Paths
workflow.set_entry_point("agent")

# THE AUTONOMOUS ROUTER: 
# The graph looks at the agent's output. If the agent requested a tool, it routes to the "tools" node.
# If the agent gave a final text answer, it routes to the "reporting" node.
workflow.add_conditional_edges(
    "agent",
    tools_condition, 
    {"tools": "tools", "__end__": "reporting"}
)

# After a tool executes, force the loop back to the agent so it can read the tool's output
workflow.add_edge("tools", "agent")
workflow.add_edge("reporting", END)

# Compile the engine
app = workflow.compile()

# ==========================================
# 6. DETERMINISTIC RUNTIME TEST BED
# ==========================================
if __name__ == "__main__":
    print("=============================================")
    print("IGNITING AUTONOMOUS INTELLIGENCE ENGINE")
    print("=============================================")
    
    ticker = "AAPL"
    
    # Initialize the engine with the System Prompt permanently locked into global memory
    execution_payload = {
        "ticker": ticker,
        "messages": [
            SystemMessage(content=f"""You are an elite quantitative financial analyst. 
            1. You MUST use your tools to fetch market data for the requested ticker.
            2. Once you receive the tool's data, you MUST immediately output a financial analysis.
            3. If current_price > fifty_day_sma, output "SIGNAL: BUY". Otherwise, output "SIGNAL: SELL".
            4. DO NOT output conversational filler like 'I am ready to help'. Just output the analysis."""),
            HumanMessage(content=f"Analyze the stock: {ticker}")
        ],
        "analysis_report": ""
    }
    
    # Invoke the execution machine synchronously
    final_output_state = app.invoke(execution_payload)
    
    print("\n=============================================")
    print("ENGINE RUN COMPLETE - FINAL ANALYSIS")
    print("=============================================")
    print(final_output_state["analysis_report"])