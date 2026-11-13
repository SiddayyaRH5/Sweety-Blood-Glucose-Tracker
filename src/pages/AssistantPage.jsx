import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  MessageSquareHeart,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useReadings } from '../context/ReadingsContext.jsx';
import { apiClient, extractApiErrorMessage } from '../services/apiClient.js';
import {
  clearChatMessagesApi,
  fetchChatMessagesApi,
  sendChatMessageApi,
} from '../services/readingsService.js';

const STARTER_PROMPTS = [
  'How do my fasting readings compare to post-meal numbers?',
  'What small habits help steady post-lunch glucose?',
  'Summarize my recent high and low readings.',
];

export function AssistantPage() {
  const { user } = useAuth();
  const { readings } = useReadings();

  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState(null);

  const scrollEndRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    if (user.isPreviewSession) {
      setMessages([]);
      return;
    }

    let active = true;
    fetchChatMessagesApi()
      .then((items) => {
        if (active) setMessages(items);
      })
      .catch((err) => {
        if (active) {
          setChatError(err instanceof Error ? err.message : 'Unable to load chat history.');
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatSending]);

  const handleGenerateInsights = async () => {
    setInsightsError(null);
    setInsightsLoading(true);
    try {
      const response = await apiClient.post('/ai/insights', {
        periodLabel: 'Recent Logged Readings',
      });
      setInsights(response.data.insights);
    } catch (err) {
      setInsightsError(
        extractApiErrorMessage(err, 'Unable to generate AI insights right now.')
      );
    } finally {
      setInsightsLoading(false);
    }
  };

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || !user || chatSending) return;

    setChatError(null);
    setChatInput('');
    setChatSending(true);

    if (user.isPreviewSession) {
      const userMsg = {
        id: `preview_${Date.now()}_u`,
        userId: user.id,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setChatError(
        'Care Assistant live AI responses require signing in with an account on the backend.'
      );
      setChatSending(false);
      return;
    }

    try {
      const result = await sendChatMessageApi(trimmed);
      setMessages((prev) => [...prev, result.userMessage, result.assistantMessage]);
    } catch (err) {
      setChatError(
        extractApiErrorMessage(err, 'Care Assistant could not respond. Please try again.')
      );
    } finally {
      setChatSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    void sendMessage(chatInput);
  };

  const handleClearChat = async () => {
    if (!user || messages.length === 0) return;
    setChatError(null);
    if (user.isPreviewSession) {
      setMessages([]);
      return;
    }
    try {
      await clearChatMessagesApi();
      setMessages([]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to clear chat history.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Care Assistant
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          AI-powered glucose pattern insights and a multi-turn wellness companion grounded in your logged data.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Gemini Glucose Intelligence Summary + Target Ranges */}
        <div className="lg:col-span-5 space-y-6">
          <section
            aria-label="AI glucose insights"
            className="bg-white rounded-2xl border border-emerald-100 p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Glucose Pattern Insights
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Analyzes {readings.length} logged reading{readings.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateInsights()}
                disabled={insightsLoading || readings.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{insightsLoading ? 'Analyzing...' : 'Generate Insights'}</span>
              </button>
            </div>

            {insightsError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{insightsError}</span>
              </div>
            )}

            {!insights && !insightsLoading && (
              <div className="py-5 text-sm text-slate-500 leading-relaxed border-t border-slate-100">
                {readings.length === 0
                  ? 'Log at least one blood glucose reading to unlock AI pattern insights.'
                  : 'Click "Generate Insights" to receive a structured summary of your fasting vs. post-meal trends and practical daily habits.'}
              </div>
            )}

            {insightsLoading && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="h-5 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-16 bg-slate-100 rounded animate-pulse" />
                <div className="h-20 bg-slate-100 rounded animate-pulse" />
              </div>
            )}

            {insights && !insightsLoading && (
              <div className="space-y-4 pt-3 border-t border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-emerald-900">
                    {insights.headline}
                  </h3>
                  <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                    {insights.summary}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-1.5">
                    Observed patterns
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {insights.patterns.map((p, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-1.5">
                    Practical focus areas
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {insights.recommendations.map((rec, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                  {insights.disclaimer}
                </p>
              </div>
            )}
          </section>

          <section
            aria-label="Reference target ranges"
            className="bg-white rounded-2xl border border-emerald-100 p-6"
          >
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              Reference Target Ranges
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              General adult orientation values used to label readings.
            </p>
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="font-medium text-slate-700">Morning (fasting)</dt>
                <dd className="font-mono tabular-nums text-emerald-800 font-semibold">
                  70–130 mg/dL
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="font-medium text-slate-700">Post-meal (1–2 hrs)</dt>
                <dd className="font-mono tabular-nums text-emerald-800 font-semibold">
                  70–180 mg/dL
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="font-medium text-slate-700">Low reading</dt>
                <dd className="font-mono tabular-nums text-amber-700 font-semibold">
                  &lt; 70 mg/dL
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="font-medium text-slate-700">High reading</dt>
                <dd className="font-mono tabular-nums text-rose-700 font-semibold">
                  250+ mg/dL
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Right: Multi-Turn Sweety Care Assistant Chatbot */}
        <section
          aria-label="Sweety Care Assistant chat"
          className="lg:col-span-7 bg-white rounded-2xl border border-emerald-100 flex flex-col h-[600px]"
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <MessageSquareHeart className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Sweety Care Assistant
                </h2>
                <p className="text-xs text-slate-500">
                  Multi-turn conversation with your glucose context
                </p>
              </div>
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => void handleClearChat()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear chat</span>
              </button>
            )}
          </div>

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-center text-center px-4 space-y-4">
                <div className="max-w-md space-y-1.5">
                  <p className="text-sm font-semibold text-slate-900">
                    Ask anything about your glucose log
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Your assistant can explain fasting vs. post-meal targets, spot timing trends in your recent readings, and suggest gentle daily routines.
                  </p>
                </div>

                <div className="flex flex-col gap-2 w-full max-w-md">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="text-left px-4 py-2.5 rounded-xl border border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50 text-xs font-medium text-emerald-900 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-[#f4f9f7] border border-emerald-100 text-slate-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}

            {chatSending && (
              <div className="flex justify-start">
                <div className="bg-[#f4f9f7] border border-emerald-100 rounded-2xl px-4 py-3 text-xs text-slate-500">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={scrollEndRef} />
          </div>

          {chatError && (
            <div
              role="alert"
              className="mx-5 mb-3 flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{chatError}</span>
            </div>
          )}

          {/* Chat Composer */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-slate-100 flex items-center gap-2.5"
          >
            <label htmlFor="assistant-chat-input" className="sr-only">
              Message Sweety Care Assistant
            </label>
            <input
              id="assistant-chat-input"
              type="text"
              placeholder="Ask about your readings, meal timing, or targets..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatSending}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatSending}
              aria-label="Send message"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
