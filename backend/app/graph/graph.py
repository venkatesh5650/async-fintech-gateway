import os
import operator
import logging
from typing import TypedDict, Annotated, List
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition

from app.graph.tools import get_historical_prices, get_market_sentiment

logger = logging.getLogger(__name__)

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    ticker: str
    analysis_report: str
    is_sufficient: bool
    retry_count: int

# Initialize Groq LLM with guaranteed model fallback chain
PRIMARY_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

def create_groq_llm(model_id: str):
    return ChatGroq(model=model_id, temperature=0)

try:
    llm = create_groq_llm(PRIMARY_MODEL)
except Exception as e:
    logger.warning(f"⚠️ Primary Groq model '{PRIMARY_MODEL}' failed initialization ({e}). Falling back to 'openai/gpt-oss-120b'.")
    llm = create_groq_llm("openai/gpt-oss-120b")

tools = [get_historical_prices, get_market_sentiment]
llm_with_tools = llm.bind_tools(tools)

# Asynchronous intelligence node for non-blocking execution
async def intelligence_node(state: AgentState):
    current_ticker = state.get("ticker", "AAPL").upper()
    logger.info(f"[NODE: INTELLIGENCE] Agent is reasoning on target asset: {current_ticker}...")
    
    system_prompt = SystemMessage(content=f"""You are an elite quantitative financial analyst evaluating {current_ticker}. 
    1. You MUST use your tools to fetch live market data from the PostgreSQL database for {current_ticker}.
    2. PRIMARY STRATEGY: If current_price > fifty_day_sma, output "SIGNAL: BUY". Otherwise, output "SIGNAL: SELL".
    3. FALLBACK STRATEGY: If price data is missing, check sentiment. If BULLISH, output "SIGNAL: BUY". If BEARISH, output "SIGNAL: SELL".
    4. REJECTION PROTOCOL: If the data is missing entirely, or you cannot make a mathematical decision, output "SIGNAL: INVALID".
    5. STRICT FORMATTING: You MUST end your report with exactly "SIGNAL: BUY", "SIGNAL: SELL", "SIGNAL: HOLD", or "SIGNAL: INVALID". DO NOT output conversational filler.""")
    
    messages_to_send = [system_prompt] + state.get("messages", [])
    
    try:
        response = await llm_with_tools.ainvoke(messages_to_send)
    except Exception as llm_err:
        logger.warning(f"⚠️ Primary LLM invocation error: {llm_err}. Retrying with fallback model 'openai/gpt-oss-120b'...")
        fallback_llm = create_groq_llm("openai/gpt-oss-120b").bind_tools(tools)
        response = await fallback_llm.ainvoke(messages_to_send)

    return {"messages": [response]}

def reporting_node(state: AgentState):
    logger.info("[NODE: REPORTING] Finalizing alpha signal report...")
    messages = state.get("messages", [])
    final_message = messages[-1].content if messages else "ERROR: No report generated."
    return {"analysis_report": str(final_message)}

def gatekeeper_node(state: AgentState):
    logger.info("[NODE: GATEKEEPER] Validating report quality...")
    report = state.get("analysis_report", "")
    retry = state.get("retry_count", 0) + 1
    
    valid_signals = ["SIGNAL: BUY", "SIGNAL: SELL", "SIGNAL: HOLD", "SIGNAL: INVALID"]
    
    if any(signal in report for signal in valid_signals):
        logger.info("[NODE: GATEKEEPER] Valid schema detected.")
        return {"is_sufficient": True, "retry_count": retry}
        
    if retry >= 2:
        logger.warning("[NODE: GATEKEEPER] Max retries reached. Defaulting to HOLD fallback.")
        fallback_report = f"{report}\n\nSIGNAL: HOLD"
        return {"is_sufficient": True, "analysis_report": fallback_report, "retry_count": retry}

    logger.warning(f"[NODE: GATEKEEPER] Schema violated (Attempt {retry}/2). Forcing pivot...")
    feedback = HumanMessage(content="GATEKEEPER REJECTION: You failed to output a valid signal. You must strictly output 'SIGNAL: BUY', 'SIGNAL: SELL', 'SIGNAL: HOLD', or 'SIGNAL: INVALID' based on the data.")
    return {"is_sufficient": False, "messages": [feedback], "retry_count": retry}

# Initialize state graph
workflow = StateGraph(AgentState)

# Register graph nodes
workflow.add_node("agent", intelligence_node)
workflow.add_node("reporting", reporting_node)
workflow.add_node("tools", ToolNode(tools)) 
workflow.add_node("gatekeeper", gatekeeper_node)

# Define graph edges and conditional routing
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