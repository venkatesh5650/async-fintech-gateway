import operator
from typing import TypedDict, Annotated, List
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition

from tools import get_historical_prices, get_market_sentiment

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    ticker: str
    analysis_report: str
    is_sufficient: bool

# CTO FIX 1: Use a valid Groq LPU model
llm = ChatGroq(model="openai/gpt-oss-20b", temperature=0)
tools = [get_historical_prices, get_market_sentiment]
llm_with_tools = llm.bind_tools(tools)

# CTO FIX 2: Async Node to prevent blocking the FastAPI event loop
async def intelligence_node(state: AgentState):
    print(f"\n[NODE: INTELLIGENCE] 🧠 Agent is reasoning on {state['ticker']}...")
    
    # CTO FIX 3: Inject System Instructions directly into the execution context
    system_prompt = SystemMessage(content=f"""You are an elite quantitative financial analyst evaluating {state['ticker']}. 
    1. You MUST use your tools to fetch live market data from the PostgreSQL database.
    2. PRIMARY STRATEGY: If current_price > fifty_day_sma, output "SIGNAL: BUY". Otherwise, output "SIGNAL: SELL".
    3. FALLBACK STRATEGY: If price data is missing, check sentiment. If BULLISH, output "SIGNAL: BUY". If BEARISH, output "SIGNAL: SELL".
    4. REJECTION PROTOCOL: If the data is missing entirely, or you cannot make a mathematical decision, output "SIGNAL: INVALID".
    5. STRICT FORMATTING: You MUST end your report with exactly "SIGNAL: BUY", "SIGNAL: SELL", "SIGNAL: HOLD", or "SIGNAL: INVALID". DO NOT output conversational filler.""")
    
    # Prepend the system prompt to the user's incoming message history
    messages_to_send = [system_prompt] + state.get("messages", [])
    
    # Use asynchronous invocation
    response = await llm_with_tools.ainvoke(messages_to_send)
    return {"messages": [response]}

def reporting_node(state: AgentState):
    print("\n[NODE: REPORTING] 📊 Finalizing alpha signal report...")
    final_message = state["messages"][-1].content
    return {"analysis_report": final_message}

def gatekeeper_node(state: AgentState):
    print("[NODE: GATEKEEPER] 🔍 Validating report quality...")
    report = state["analysis_report"]
    
    valid_signals = ["SIGNAL: BUY", "SIGNAL: SELL", "SIGNAL: HOLD", "SIGNAL: INVALID"]
    
    if any(signal in report for signal in valid_signals):
        print("[NODE: GATEKEEPER] ✅ Valid schema detected.")
        return {"is_sufficient": True}
        
    print("[NODE: GATEKEEPER] ⚠️ Schema violated. Forcing pivot...")
    feedback = HumanMessage(content="GATEKEEPER REJECTION: You failed to output a valid signal. You must strictly output 'SIGNAL: BUY', 'SIGNAL: SELL', 'SIGNAL: HOLD', or 'SIGNAL: INVALID' based on the data.")
    return {"is_sufficient": False, "messages": [feedback]}

# 1. Initialize Graph
workflow = StateGraph(AgentState)

# 2. Register all Nodes FIRST
workflow.add_node("agent", intelligence_node)
workflow.add_node("reporting", reporting_node)
workflow.add_node("tools", ToolNode(tools)) # LangGraph natively handles async tools here
workflow.add_node("gatekeeper", gatekeeper_node)

# 3. Define the Flow (Edges)
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", tools_condition, {"tools": "tools", "__end__": "reporting"})
workflow.add_edge("tools", "agent")
workflow.add_edge("reporting", "gatekeeper")
workflow.add_conditional_edges(
    "gatekeeper", 
    lambda state: "agent" if not state.get("is_sufficient", False) else END,
    {"agent": "agent", END: END}
)

app = workflow.compile()