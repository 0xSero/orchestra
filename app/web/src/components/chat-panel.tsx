import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { useSelectedWorker, useWorkerActions } from "@/hooks/use-workers";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function ChatPanel() {
  const worker = useSelectedWorker();
  const { sendMessage } = useWorkerActions();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for streaming chunks
  useEffect(() => {
    if (!worker) return;

    const handleChunk = (e: CustomEvent<{ workerId: string; chunk: string; final?: boolean }>) => {
      if (e.detail.workerId !== worker.profile.id) return;

      setStreamingContent((prev) => prev + e.detail.chunk);

      if (e.detail.final) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: streamingContent + e.detail.chunk,
            timestamp: new Date(),
          },
        ]);
        setStreamingContent("");
        setStreaming(false);
      }
    };

    window.addEventListener("worker:chunk", handleChunk as EventListener);
    return () => window.removeEventListener("worker:chunk", handleChunk as EventListener);
  }, [worker, streamingContent]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Focus input when worker changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [worker?.profile.id]);

  const handleSend = useCallback(async () => {
    if (!worker || !input.trim() || streaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    try {
      await sendMessage(worker.profile.id, userMessage.content);
    } catch (error) {
      setStreaming(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${(error as Error).message}`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [worker, input, streaming, sendMessage]);

  if (!worker) {
    return (
      <Card className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Select a worker to chat</p>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{worker.profile.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{worker.profile.purpose}</p>
          </div>
          <StatusBadge status={worker.status} />
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <pre className="whitespace-pre-wrap font-sans">
                    {message.content}
                  </pre>
                </div>
              </div>
            ))}

            {/* Streaming message */}
            {streaming && streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-4 py-2 text-sm bg-muted">
                  <pre className="whitespace-pre-wrap font-sans">
                    {streamingContent}
                    <span className="animate-pulse-soft">▋</span>
                  </pre>
                </div>
              </div>
            )}

            {/* Streaming indicator */}
            {streaming && !streamingContent && (
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-2 bg-muted">
                  <span className="text-sm text-muted-foreground animate-pulse-soft">
                    Thinking...
                  </span>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-border p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message..."
              disabled={streaming || worker.status !== "ready"}
            />
            <Button
              type="submit"
              disabled={!input.trim() || streaming || worker.status !== "ready"}
            >
              Send
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
