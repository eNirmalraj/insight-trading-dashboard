import React, { useState, useRef, useEffect } from 'react';
import { SparklesIcon, SendIcon, CloseIcon } from './IconComponents';
import * as api from '../api';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface InsightAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

const InsightAssistant: React.FC<InsightAssistantProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if(isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100); // Small delay to allow for transition
    }
  }, [isOpen]);

  const handleSendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const newUserMessage: Message = { role: 'user', text: messageText };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);
    setInput('');

    try {
      const responseText = await api.getAssistantResponse(messageText);
      const newModelMessage: Message = { role: 'model', text: responseText };
      setMessages(prev => [...prev, newModelMessage]);
    } catch (error) {
      const errorMessage: Message = { role: 'model', text: "Sorry, I couldn't get a response. Please check your connection or try again." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  const SuggestedPrompt: React.FC<{ text: string }> = ({ text }) => (
    <button
      onClick={() => handleSendMessage(text)}
      className="bg-gray-700/50 hover:bg-gray-700 text-left text-sm text-gray-300 p-3 rounded-lg transition-colors"
    >
      {text}
    </button>
  );

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        className={`fixed bottom-6 right-6 bg-card-bg border border-gray-700/50 rounded-2xl shadow-2xl w-[90vw] max-w-lg h-[80vh] max-h-[700px] flex flex-col transition-all duration-300 z-50 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <SparklesIcon className="w-6 h-6 text-blue-400" />
            <h2 id="assistant-title" className="text-lg font-semibold text-white">Insight Assistant</h2>
          </div>
          <button onClick={onClose} aria-label="Close assistant" className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col h-full justify-center text-center">
              <div className="space-y-3">
                <p className="text-gray-300">Hello! I can help you use the Insight Trading platform. What would you like to know?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-4">
                  <SuggestedPrompt text="How do I create a new watchlist?" />
                  <SuggestedPrompt text="Explain the tools on the market chart." />
                  <SuggestedPrompt text="Where can I see my trading history?" />
                  <SuggestedPrompt text="How do I connect my Binance account?" />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((msg, index) => (
              <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0"><SparklesIcon className="w-5 h-5 text-blue-400" /></div>}
                <div className={`max-w-md p-3 rounded-2xl text-white ${msg.role === 'user' ? 'bg-blue-500 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}>
                  {msg.role === 'model' ? <div className="prose-container"><div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br />') }} /></div> : msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                 <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0"><SparklesIcon className="w-5 h-5 text-blue-400" /></div>
                 <div className="max-w-md p-3 rounded-2xl bg-gray-700 rounded-bl-none flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0s' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                 </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="p-4 border-t border-gray-700/50">
          <form onSubmit={handleFormSubmit} className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about platform features..."
              disabled={isLoading}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default InsightAssistant;
