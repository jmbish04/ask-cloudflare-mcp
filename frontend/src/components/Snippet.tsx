import { useState } from 'react';
import { Button, Card } from "@heroui/react";

interface SnippetProps {
  children: string | string[];
  symbol?: string;
  className?: string;
}

export const Snippet = ({ children, symbol = "$", className = "" }: SnippetProps) => {
  const [copied, setCopied] = useState(false);
  const textToCopy = Array.isArray(children) ? children.join('\n') : children;
  const displayContent = textToCopy.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className={`relative group ${className}`}>
      <Card className="bg-default-100 dark:bg-default-50 border border-default-200">
        <Card.Content className="p-4 font-mono text-sm overflow-x-auto flex items-start gap-2">
          <div className="select-none text-default-400 shrink-0">{symbol}</div>
          <pre className="whitespace-pre-wrap break-all">{displayContent}</pre>
        </Card.Content>
      </Card>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button 
          size="sm" 
          variant="flat" 
          onPress={handleCopy}
          className="min-w-unit-8 h-unit-8"
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
};

