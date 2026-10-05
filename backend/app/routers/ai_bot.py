import logging
from typing import Optional
from fastapi import APIRouter, status, UploadFile, File, Form
from pydantic import BaseModel
import os
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

from app.core.bot_knowledge import build_system_prompt_for_route

logger = logging.getLogger("ai_bot_router")

router = APIRouter(
    prefix="/v1/ai-bot",
    tags=["AI Educational Assistant"],
)

class ChatRequest(BaseModel):
    message: str
    current_route: str
    ticker_symbol: Optional[str] = None
    
class ChatResponse(BaseModel):
    reply: str
    system_prompt_used: Optional[str] = None

@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Text Chat with AI Assistant",
    description="Sends user message along with current app context to LLM for a smart, context-aware educational response."
)
async def chat_with_bot(request: ChatRequest):
    """
    Core text chat endpoint. Uses the dynamic knowledge base to ground the LLM.
    """
    system_prompt = build_system_prompt_for_route(
        current_route=request.current_route,
        ticker_symbol=request.ticker_symbol
    )
    
    try:
        model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        llm = ChatGroq(model=model_name, temperature=0.7)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=request.message)
        ]
        response = await llm.ainvoke(messages)
        reply = response.content
    except Exception as e:
        logger.error(f"Error calling Groq LLM in AI Bot: {e}")
        context_hint = "General usage"
        if "Page Purpose:" in system_prompt:
            context_hint = system_prompt.split("Page Purpose:")[1].split("-")[0].strip()
        reply = (
            f"I see you are asking about '{request.message}'. "
            f"Because you are on the route '{request.current_route}', "
            f"I know this page is for: {context_hint}. "
            f"(Note: I am in fallback mode. Please ensure GROQ_API_KEY is valid for real answers!)"
        )
    
    logger.info(f"AI Bot Chat invoked for route: {request.current_route}")
    
    return ChatResponse(
        reply=reply,
        system_prompt_used=system_prompt
    )

@router.post(
    "/voice",
    status_code=status.HTTP_200_OK,
    summary="Voice Chat with AI Assistant",
    description="Accepts an audio file, transcribes it via STT, generates a response, and returns TTS audio."
)
async def voice_chat_with_bot(
    audio_file: UploadFile = File(...),
    current_route: str = Form(...),
    ticker_symbol: Optional[str] = Form(None)
):
    """
    Voice-to-voice endpoint.
    1. Receives audio blob from frontend (Web Audio API).
    2. Uses STT (e.g., Whisper) to transcribe.
    3. Calls the same chat logic to get LLM response.
    4. Uses TTS (e.g., ElevenLabs) to synthesize speech.
    5. Returns audio file to play in browser.
    """
    audio_bytes = await audio_file.read()
    logger.info(f"Received audio file {audio_file.filename} of size {len(audio_bytes)} bytes.")
    
    # 1. Transcribe (Mock)
    transcribed_text = "What does P/E ratio mean?"
    
    # 2. Generate context-aware response
    system_prompt = build_system_prompt_for_route(current_route, ticker_symbol)
    llm_text_response = "The P/E ratio shows how much you are paying for one dollar of earnings. A high P/E implies high growth expectations."
    
    # 3. Synthesize Audio (Mock)
    # In production: tts_audio = elevenlabs.generate(text=llm_text_response)
    
    # Returning a structured JSON for the MVP so you can verify the pipeline logic
    # before we start streaming real binary audio blobs.
    return {
        "status": "success",
        "pipeline": {
            "received_file": audio_file.filename,
            "stt_transcription": transcribed_text,
            "llm_response": llm_text_response,
            "tts_status": "Audio synthesis ready to be integrated"
        }
    }
