import operator
from typing import TypedDict, Annotated, List
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition

from tools import get_historical_prices

# State object defining the memory payload passed between nodes during cyclic execution.
# operator.add enforces an append-only message stack to strictly preserve the interaction history.
class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    ticker: str
    analysis_report: str

# Deterministic LLM configuration mapped to the internal proxy. 
# Temperature 0 enforces strict adherence to system prompts and limits hallucinatory drift.
llm = ChatGroq(model="openai/gpt-oss-20b", temperature=0)

tools = [get_historical_prices]
llm_with_tools = llm.bind_tools(tools)

def intelligence_node(state: AgentState):
    """
    Primary reasoning router. Evaluates the current message stack and either 
    yields a structured tool call or synthesizes the final response for extraction.
    """
    print("\n[NODE: INTELLIGENCE] 🧠 Agent is reasoning...")
    messages = state.get("messages", [])
    ticker = state.get("ticker")
    
    response = llm_with_tools.invoke(messages)
    
    return {"messages": [response]}

def reporting_node(state: AgentState):
    """
    Terminal extraction node. Isolates the final resolved text from the graph state 
    for clean downstream API consumption.
    """
    print("\n[NODE: REPORTING] 📊 Finalizing alpha signal report...")
    final_message = state["messages"][-1].content
    return {"analysis_report": final_message}

# Directed Cyclic Graph (DCG) configuration for autonomous state machine execution.
workflow = StateGraph(AgentState)

workflow.add_node("agent", intelligence_node)
workflow.add_node("reporting", reporting_node)
workflow.add_node("tools", ToolNode(tools))

workflow.set_entry_point("agent")

# Native routing condition: Evaluates the AI's AIMessage for a 'tool_calls' payload.
# If present, routes to the execution perimeter. If empty, forces the graph termination sequence.
workflow.add_conditional_edges(
    "agent",
    tools_condition, 
    {"tools": "tools", "__end__": "reporting"}
)

workflow.add_edge("tools", "agent")
workflow.add_edge("reporting", END)

app = workflow.compile()

if __name__ == "__main__":
    print("=============================================")
    print("IGNITING AUTONOMOUS INTELLIGENCE ENGINE")
    print("=============================================")
    
    ticker = "AAPL"
    
    # Initial execution payload injecting the immutable system prompt and dynamic user parameters.
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
    
    final_output_state = app.invoke(execution_payload)
    
    print("\n=============================================")
    print("ENGINE RUN COMPLETE - FINAL ANALYSIS")
    print("=============================================")
    print(final_output_state["analysis_report"])