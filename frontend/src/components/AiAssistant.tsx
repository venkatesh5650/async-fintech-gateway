'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Mic, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
}

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const pathname = usePathname();
  
  // Extract ticker from pathname
  const pathParts = pathname?.split('/') || [];
  const ticker = pathParts.length > 2 && pathParts[1] === 'dashboard' ? pathParts[2] : null;

  // Suggested prompts based on context
  const suggestedPrompts = ticker 
    ? [`What is ${ticker}'s P/E ratio?`, `Explain the DCF Valuation`, `How do I read this chart?`]
    : [`How do I search for a stock?`, `What does this platform do?`, `What is the Market Summary?`];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Initial greeting
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'greeting',
          sender: 'bot',
          text: 'Hello! I am your AI Educational Assistant. I see you are on the platform. How can I help you understand this page?'
        }
      ]);
    }
  }, [isOpen, messages.length]);

  const handleSendText = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    if (!overrideText) setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/backend/v1/ai-bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          current_route: pathname || '/dashboard',
          ticker_symbol: ticker
        })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), sender: 'bot', text: data.reply }
      ]);
    } catch (error) {
      console.error('Error talking to AI Bot:', error);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), sender: 'bot', text: "Sorry, I'm having trouble connecting right now." }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Show user that voice is processing
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), sender: 'user', text: "🎤 (Voice Message Sent)" }
        ]);
        setIsTyping(true);

        // Send to backend
        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'recording.webm');
        formData.append('current_route', pathname || '/dashboard');
        if (ticker) {
          formData.append('ticker_symbol', ticker);
        }

        try {
          const response = await fetch('/api/backend/v1/ai-bot/voice', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) throw new Error('Failed to process voice');
          const data = await response.json();
          
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), sender: 'bot', text: data.pipeline.llm_response || "Voice processed!" }
          ]);
          
        } catch (err) {
          console.error(err);
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), sender: 'bot', text: "Failed to process voice." }
          ]);
        } finally {
          setIsTyping(false);
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-[350px] sm:w-[400px] h-[550px] bg-[#0A0F1C]/90 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-[0_0_40px_rgba(6,182,212,0.15)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 to-blue-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg text-cyan-400">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">FinTech Tutor AI</h3>
                  <p className="text-xs text-cyan-400/80">Context-Aware Assistant</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-cyan-600 text-white rounded-tr-sm'
                        : 'bg-slate-800/80 text-slate-200 border border-slate-700 rounded-tl-sm'
                    }`}
                  >
                    {msg.sender === 'bot' ? (
                      <div className="prose prose-invert prose-sm max-w-none text-slate-200 prose-p:leading-snug prose-headings:text-cyan-300 prose-a:text-cyan-400">
                        <ReactMarkdown>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </motion.div>
              ))}
              
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-slate-800/80 p-3 rounded-2xl rounded-tl-sm border border-slate-700 flex gap-1">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-75" />
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-150" />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts Area */}
            {messages.length < 3 && !isTyping && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendText(prompt)}
                    className="text-xs px-3 py-1.5 bg-slate-800/60 hover:bg-cyan-900/40 text-cyan-200 border border-cyan-700/50 rounded-full transition-colors whitespace-nowrap"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Input Area */}
            <div className="p-3 border-t border-cyan-500/20 bg-[#0A0F1C]">
              <div className="flex items-center gap-2 bg-slate-900/50 rounded-xl border border-slate-700/50 p-1 pr-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                  placeholder="Ask about this page..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white px-3 py-2 placeholder-slate-500"
                />
                
                {/* Voice Button */}
                <button
                  onClick={handleVoiceRecording}
                  title={isRecording ? "Stop Recording" : "Start Voice Recording"}
                  className={`p-2 rounded-lg transition-all ${
                    isRecording 
                      ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/50' 
                      : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-400 border border-transparent'
                  }`}
                >
                  <Mic size={18} />
                </button>

                {/* Send Button */}
                <button
                  onClick={() => handleSendText()}
                  disabled={!input.trim()}
                  className="p-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500 text-white rounded-lg transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-cyan-500 hover:bg-cyan-400 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center text-white transition-colors"
      >
        {isOpen ? <X size={24} /> : <Bot size={28} />}
      </motion.button>
    </div>
  );
}
