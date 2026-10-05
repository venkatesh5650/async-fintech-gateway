# backend/app/core/bot_knowledge.py

"""
This module serves as the initial "Brain" for the AI Educational Assistant.
It maps specific application routes (URLs) and UI components to plain-English, beginner-friendly explanations.

For our MVP, a structured dictionary is the smartest, lowest-latency way to inject context.
As the application grows, this data will be vectorized and moved into a Vector Database (like Pinecone) for RAG.
"""

APP_KNOWLEDGE = {
    "general": {
        "platform_mission": "This application is an Autonomous Equity Research Gateway. It uses multiple AI agents to read financial reports, analyze market data, and generate institutional-grade research.",
        "target_audience": "Beginner to intermediate investors who want to understand deep fundamental analysis without needing a finance degree.",
        "bot_persona": "You are a patient, highly knowledgeable financial tutor built into the platform. You explain complex financial concepts simply, using analogies if helpful. You strictly explain what the application features do and what financial terms mean. You NEVER give investment advice (e.g., never say 'Buy this stock'). ALWAYS structure your response beautifully using Markdown. Use bolding, bullet points, and headers to make your explanations scannable. Whenever applicable to explain a concept (like order flow or pipelines), use simple text-based ASCII diagrams or Markdown tables to visually explain things like ChatGPT does."
    },
    "/dashboard": {
        "page_purpose": "The main command center where users can see an overview of the market and search for specific equities (stocks).",
        "features": {
            "Ticker Search": "A search bar to find publicly traded companies using their symbol (e.g., AAPL for Apple).",
            "Market Summary": "A quick snapshot of how major indices (like the S&P 500) are performing today."
        }
    },
    "/dashboard/[ticker]": { # Matches routes like /dashboard/AAPL
        "page_purpose": "The deep-dive research page for a specific company. It aggregates price action, financial metrics, and AI-generated insights.",
        "features": {
            "Candlestick Chart": "A chart showing price movement. Green candles mean the price went up during that period; red means it went down. The 'wicks' (lines on top/bottom) show the highest and lowest prices.",
            "P/E Ratio (Price-to-Earnings)": "Shows how much investors are paying for $1 of the company's earnings. A high P/E might mean the stock is expensive, or that high growth is expected.",
            "Market Cap": "The total value of all the company's shares combined. It tells you the size of the company.",
            "DCF (Discounted Cash Flow)": "A complex valuation method that estimates what a company is worth today based on how much cash it is expected to generate in the future.",
            "Phase 2 Capstone Report": "An AI-generated, comprehensive report analyzing the company's SEC filings, risks, and competitive advantages."
        }
    }
}

def build_system_prompt_for_route(current_route: str, ticker_symbol: str = None) -> str:
    """
    Dynamically builds the system prompt for the LLM based on where the user currently is in the app.
    """
    persona = APP_KNOWLEDGE["general"]["bot_persona"]
    mission = APP_KNOWLEDGE["general"]["platform_mission"]
    
    # Determine which context to pull based on the route
    route_context = APP_KNOWLEDGE.get("general")
    if current_route == "/dashboard":
        route_context = APP_KNOWLEDGE["/dashboard"]
    elif current_route.startswith("/dashboard/") and ticker_symbol:
        route_context = APP_KNOWLEDGE["/dashboard/[ticker]"]
        
    # Format the context into a string for the LLM
    context_str = f"Context about the current page the user is viewing:\n"
    context_str += f"- Page Purpose: {route_context.get('page_purpose', 'General application usage.')}\n"
    
    if "features" in route_context:
        context_str += "- Features visible on this page:\n"
        for feature, explanation in route_context["features"].items():
            context_str += f"  * {feature}: {explanation}\n"
            
    if ticker_symbol:
        context_str += f"\nNote: The user is currently analyzing the stock: {ticker_symbol}\n"
        
    final_prompt = f"{persona}\n\nPlatform Mission: {mission}\n\n{context_str}"
    
    return final_prompt
