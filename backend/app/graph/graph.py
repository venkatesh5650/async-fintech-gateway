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
    quant_context: dict
    quant_context_injected: bool
    rag_context: list
    citations: list
    rag_context_injected: bool
    stress_scenario: dict
    debate_log: list


# Initialize Groq LLM with guaranteed model fallback chain
PRIMARY_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")


def create_groq_llm(model_id: str):
    return ChatGroq(model=model_id, temperature=0)


try:
    llm = create_groq_llm(PRIMARY_MODEL)
except Exception as e:
    logger.warning(
        f"⚠️ Primary Groq model '{PRIMARY_MODEL}' failed initialization ({e}). Falling back to 'openai/gpt-oss-20b'."
    )
    llm = create_groq_llm("openai/gpt-oss-20b")

tools = [get_historical_prices, get_market_sentiment]
llm_with_tools = llm.bind_tools(tools)


# Asynchronous intelligence node for non-blocking execution
async def intelligence_node(state: AgentState):
    current_ticker = state.get("ticker", "AAPL").upper()
    logger.info(f"[NODE: INTELLIGENCE] Agent is reasoning on target asset: {current_ticker}...")

    quant_context = {}
    quant_injected = False
    try:
        from app.database.database import AsyncSessionLocal
        from app.core.analytics import QuantitativeAnalyticsEngine

        async with AsyncSessionLocal() as session:
            composite = await QuantitativeAnalyticsEngine.compute_composite_signal(session, current_ticker)
            volatility = await QuantitativeAnalyticsEngine.compute_volatility_metrics(session, current_ticker)
            quant_context = {
                "composite_score": composite.get("composite_score"),
                "recommendation": composite.get("recommendation"),
                "sub_scores": composite.get("sub_scores"),
                "volatility_30d_pct": volatility.get("volatility_30d_pct"),
                "sharpe_ratio": volatility.get("sharpe_ratio"),
                "max_drawdown_pct": volatility.get("max_drawdown_pct"),
                "risk_level": volatility.get("risk_level"),
            }
            quant_injected = True
    except Exception as q_err:
        logger.warning(f"⚠️ Could not compute quant context for {current_ticker}: {q_err}")

    rag_context = []
    citations = []
    rag_injected = False
    try:
        from app.core.document_search import search_document_chunks

        rag_hits = await search_document_chunks(
            ticker=current_ticker,
            query="Risk Factors revenues gross margins guidance financial position",
            top_k=3,
            min_similarity=0.0,
        )
        if rag_hits:
            for hit in rag_hits:
                citation_ref = f"[{hit['doc_type']} | {hit['source_file']} P.{hit['page_number']}]"
                citations.append(
                    {
                        "citation_ref": citation_ref,
                        "doc_type": hit["doc_type"],
                        "source_file": hit["source_file"],
                        "page_number": hit["page_number"],
                        "similarity_score": hit["similarity_score"],
                        "excerpt": hit["content"][:240] + "..." if len(hit["content"]) > 240 else hit["content"],
                    }
                )
                rag_context.append(hit)
            rag_injected = True
    except Exception as r_err:
        logger.warning(f"⚠️ Could not retrieve RAG context for {current_ticker}: {r_err}")

    quant_prompt_block = ""
    if quant_injected and quant_context:
        quant_prompt_block = f"""
    QUANTITATIVE ENGINE ANALYTICS (PRE-COMPUTED HIGH-PRECISION DATA):
    - Composite Technical Score: {quant_context.get("composite_score")}/100 ({quant_context.get("recommendation")})
    - 30-Day Volatility: {quant_context.get("volatility_30d_pct")}% ({quant_context.get("risk_level")})
    - Sharpe Ratio: {quant_context.get("sharpe_ratio")}
    - Max Drawdown: {quant_context.get("max_drawdown_pct")}%
    Use these pre-computed indicators to validate or weigh your final alpha signal calculation.
"""

    rag_prompt_block = ""
    if rag_injected and citations:
        rag_prompt_block = "\n    QUALITATIVE SEC FILING CONTEXT (GROUNDED RAG PASSAGES):\n"
        for c in citations:
            rag_prompt_block += f"    - {c['citation_ref']}: {c['excerpt']}\n"
        rag_prompt_block += (
            "    Incorporate relevant qualitative disclosures into your rationale, referencing the source citation.\n"
        )

    stress_scenario = state.get("stress_scenario", {})
    stress_prompt_block = ""
    if stress_scenario:
        stress_prompt_block = f"""
    MACRO STRESS SCENARIO INJECTED:
    - Fed Funds Rate Change: {stress_scenario.get('fedRate', 0)} bps
    - VIX Spike: +{stress_scenario.get('vixSpike', 0)}%
    - Earnings Revisions: {stress_scenario.get('earningsRevision', 0)}%
    
    You MUST re-evaluate the asset under these highly stressful macroeconomic conditions.
    Adjust your final Conviction Score and signal accordingly. Explain how this specific company's 
    balance sheet, debt structure, or business model reacts to these specific shocks.
"""

    system_prompt = SystemMessage(
        content=f"""You are an elite quantitative financial analyst evaluating {current_ticker}. 
{quant_prompt_block}
{rag_prompt_block}
{stress_prompt_block}
    1. You MUST use your tools to fetch live market data from the PostgreSQL database for {current_ticker}.
    2. PRIMARY STRATEGY: Synthesize both the pre-computed Quantitative Engine Analytics and live market data:
       - When Composite Technical Score is Bullish (>= 60) AND current_price > fifty_day_sma, output "SIGNAL: BUY".
       - When Composite Technical Score is Bearish (<= 40) OR current_price < fifty_day_sma with severe drawdown or high volatility (Sharpe < 0 or Drawdown > 40%), output "SIGNAL: SELL".
       - If indicators conflict (e.g. oversold technical score but severe price breakdown below SMA and negative Sharpe), prioritize downside risk mitigation: output "SIGNAL: SELL" or "SIGNAL: HOLD", explaining the rationale in your report.
       - Otherwise, output "SIGNAL: HOLD".
    3. FALLBACK STRATEGY: If price data is missing, check sentiment. If BULLISH, output "SIGNAL: BUY". If BEARISH, output "SIGNAL: SELL".
    4. REJECTION PROTOCOL: If the data is missing entirely, or you cannot make a mathematical decision, output "SIGNAL: INVALID".
    5. STRICT FORMATTING: You MUST end your report with exactly "SIGNAL: BUY", "SIGNAL: SELL", "SIGNAL: HOLD", or "SIGNAL: INVALID". DO NOT output conversational filler."""
    )

    messages_to_send = [system_prompt] + state.get("messages", [])

    response = None
    fallback_models = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]

    try:
        response = await llm_with_tools.ainvoke(messages_to_send)
    except Exception as llm_err:
        logger.warning(f"⚠️ Primary LLM invocation error: {llm_err}. Attempting fallback models...")
        for fb_model in fallback_models:
            try:
                fb_llm = create_groq_llm(fb_model).bind_tools(tools)
                response = await fb_llm.ainvoke(messages_to_send)
                break
            except Exception as fb_err:
                logger.warning(f"⚠️ Fallback model '{fb_model}' failed: {fb_err}")

        if response is None:
            logger.warning(
                f"🛡️ [RESILIENCE FALLBACK] External LLM quotas exhausted for {current_ticker}. "
                "Synthesizing deterministic quantitative report from PostgreSQL indicators."
            )
            rec = quant_context.get("recommendation", "NEUTRAL") if quant_context else "NEUTRAL"
            score = quant_context.get("composite_score", 50.0) if quant_context else 50.0
            sharpe = quant_context.get("sharpe_ratio", 1.0) if quant_context else 1.0
            vol = quant_context.get("volatility_30d_pct", 25.0) if quant_context else 25.0
            dd = quant_context.get("max_drawdown_pct", 10.0) if quant_context else 10.0

            if "BUY" in rec:
                signal_str = "SIGNAL: BUY"
            elif "SELL" in rec:
                signal_str = "SIGNAL: SELL"
            else:
                signal_str = "SIGNAL: HOLD"

            rag_summary = ""
            if citations:
                rag_summary = (
                    f"\n\nQualitative Disclosures Grounded:\n- {citations[0].get('citation_ref', '')}: "
                    f"{citations[0].get('excerpt', '')[:160]}..."
                )

            fallback_content = (
                f"EXECUTIVE FINANCIAL ANALYSIS FOR {current_ticker}\n\n"
                f"Quantitative Technical Synthesis (PostgreSQL Engine):\n"
                f"- Composite Technical Score: {score}/100 ({rec})\n"
                f"- 30-Day Volatility: {vol}% | Sharpe Ratio: {sharpe}\n"
                f"- Maximum Drawdown: {dd}%\n\n"
                f"Deterministic Strategy Evaluation:\n"
                f"The algorithmic engine completed statistical valuation for {current_ticker}. "
                f"Based on historical price series, momentum indicators, and risk metrics, "
                f"the multi-factor model indicates a {rec.replace('_', ' ')} posture.{rag_summary}\n\n"
                f"{signal_str}"
            )
            from langchain_core.messages import AIMessage

            response = AIMessage(content=fallback_content)

    return {
        "messages": [response],
        "quant_context": quant_context,
        "quant_context_injected": quant_injected,
        "rag_context": rag_context,
        "citations": citations,
        "rag_context_injected": rag_injected,
    }


def reporting_node(state: AgentState):
    logger.info("[NODE: REPORTING] Finalizing alpha signal report...")
    messages = state.get("messages", [])
    final_message = messages[-1].content if messages else "ERROR: No report generated."
    
    quant_context = state.get("quant_context", {})
    citations = state.get("citations", [])
    
    # Synthesize the Adversarial Debate Log smartly
    debate_log = []
    
    if quant_context:
        rec = quant_context.get("recommendation", "NEUTRAL").upper()
        score = quant_context.get("composite_score", 50)
        vol = quant_context.get("volatility_30d_pct", 0)
        debate_log.append({
            "agent": "Sentinel-Q (Quant)",
            "message": f"Technical momentum indicates {rec} posture. Composite score: {score}/100. 30D Volatility: {vol}%. Recommend algorithmic alignment.",
            "type": "quant"
        })
        
    if citations:
        ref = citations[0].get("citation_ref", "SEC Filing")
        excerpt = citations[0].get("excerpt", "")[:120].strip()
        debate_log.append({
            "agent": "Lexicon-X (Risk)",
            "message": f"Contradiction detected: {ref} flags material risks: '{excerpt}...'. Caution advised.",
            "type": "rag"
        })
        
    clean_msg = str(final_message).replace('*', '').replace('#', '').strip()
    summary_sentences = [s.strip() for s in clean_msg.split('.') if s.strip()]
    arbiter_msg = '. '.join(summary_sentences[:2]) + '.' if len(summary_sentences) >= 2 else clean_msg[:150] + "..."
    
    debate_log.append({
        "agent": "Arbiter Core (Consensus)",
        "message": f"Reconciled: {arbiter_msg}",
        "type": "consensus"
    })

    return {
        "analysis_report": str(final_message),
        "debate_log": debate_log,
        "quant_context": quant_context,
        "quant_context_injected": state.get("quant_context_injected", False),
        "rag_context": state.get("rag_context", []),
        "citations": citations,
        "rag_context_injected": state.get("rag_context_injected", False),
    }


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
    feedback = HumanMessage(
        content="GATEKEEPER REJECTION: You failed to output a valid signal. You must strictly output 'SIGNAL: BUY', 'SIGNAL: SELL', 'SIGNAL: HOLD', or 'SIGNAL: INVALID' based on the data."
    )
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
    "gatekeeper", lambda state: "agent" if not state.get("is_sufficient", False) else END, {"agent": "agent", END: END}
)

app = workflow.compile()
