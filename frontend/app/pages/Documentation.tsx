import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTranslation } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Download, Eye, Moon, Sun } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Documentation() {
  const { t } = useTranslation();
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);

    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy to clipboard');
    }
  };

  const downloadDocumentation = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'documentation.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Documentation downloaded!');
  };

  useEffect(() => {
    const loadDocumentation = async () => {
      try {
        // Use a query parameter to prevent WebSocket operations
        const response = await fetch('/doc.md');
        if (!response.ok) {
          throw new Error('Failed to load documentation');
        }
        const text = await response.text();
        setMarkdown(text);
      } catch (err) {
        console.error('Error loading documentation:', err);
        setError(t('documentation.loadError') || 'Failed to load documentation');
      } finally {
        setLoading(false);
      }
    };

    // Set a flag to indicate we're on the documentation page
    (window as any).isDocumentationPage = true;
    loadDocumentation();

    return () => {
      // Clean up the flag when component unmounts
      (window as any).isDocumentationPage = false;
    };
  }, [t]);

  if (loading) {
    return (
      <div className="p-8">
        <Card className="p-6">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">{t('documentation.loading') || 'Loading documentation...'}</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="p-6">
          <div className="text-center py-8">
            <div className="text-red-500 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('documentation.errorTitle') || 'Error'}</h2>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  // Custom components for markdown rendering
  const components = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      
      return !inline && match ? (
        <div className="relative rounded-lg overflow-hidden my-6">
          <div className="flex items-center justify-between bg-gray-800 text-gray-300 px-4 py-2 text-sm">
            <span className="font-mono">{language}</span>
            <Badge variant="secondary" className="text-xs">
              {children.toString().split('\n').length} lines
            </Badge>
          </div>
          <SyntaxHighlighter
            style={tomorrow}
            language={language}
            PreTag="div"
            className="!m-0"
            customStyle={{
              margin: 0,
              borderTop: '1px solid #374151',
              borderRadius: '0 0 0.5rem 0.5rem',
              fontSize: '0.875rem',
              lineHeight: '1.5',
            }}
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded text-sm font-mono before:content-['`'] after:content-['`']">
          {children}
        </code>
      );
    },
    
    table({ children, ...props }: any) {
      return (
        <div className="my-6 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <Table className="border-none">
            {children}
          </Table>
        </div>
      );
    },
    
    thead({ children, ...props }: any) {
      return (
        <TableHeader className="bg-gray-50 dark:bg-gray-800">
          {children}
        </TableHeader>
      );
    },
    
    tbody({ children, ...props }: any) {
      return (
        <TableBody>
          {children}
        </TableBody>
      );
    },
    
    tr({ children, ...props }: any) {
      return (
        <TableRow className="border-b border-gray-200 dark:border-gray-700">
          {children}
        </TableRow>
      );
    },
    
    th({ children, ...props }: any) {
      return (
        <TableHead className="font-semibold text-gray-900 dark:text-gray-100 px-4 py-3 text-left">
          {children}
        </TableHead>
      );
    },
    
    td({ children, ...props }: any) {
      return (
        <TableCell className="px-4 py-3 text-gray-700 dark:text-gray-300">
          {children}
        </TableCell>
      );
    },
    
    blockquote({ children }: any) {
      return (
        <blockquote className="border-l-4 border-blue-500 dark:border-blue-400 pl-4 my-6 italic text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/10 py-2 rounded-r-lg">
          {children}
        </blockquote>
      );
    },
    
    h1({ children }: any) {
      return <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8 mt-8 pb-3 border-b-2 border-gray-200 dark:border-gray-700">{children}</h1>;
    },
    
    h2({ children }: any) {
      return <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 mt-8 pb-2 border-b border-gray-200 dark:border-gray-700">{children}</h2>;
    },
    
    h3({ children }: any) {
      return <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 mt-6">{children}</h3>;
    },
    
    h4({ children }: any) {
      return <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 mt-5">{children}</h4>;
    },
    
    ul({ children }: any) {
      return <ul className="list-disc list-inside space-y-2 my-4 text-gray-700 dark:text-gray-300 ml-4">{children}</ul>;
    },
    
    ol({ children }: any) {
      return <ol className="list-decimal list-inside space-y-2 my-4 text-gray-700 dark:text-gray-300 ml-4">{children}</ol>;
    },
    
    li({ children }: any) {
      return <li className="leading-relaxed">{children}</li>;
    },
    
    hr() {
      return <Separator className="my-8" />;
    },
    
    a({ children, href }: any) {
      return (
        <a 
          href={href} 
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline decoration-2 underline-offset-2 hover:underline-offset-4 transition-all duration-200"
          target={href?.startsWith('http') ? '_blank' : '_self'}
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {children}
        </a>
      );
    },
    
    p({ children }: any) {
      return <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4 my-4">{children}</p>;
    },
    
    strong({ children }: any) {
      return <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>;
    },
    
    em({ children }: any) {
      return <em className="italic text-gray-700 dark:text-gray-300">{children}</em>;
    }
  };

  return (
    <ScrollArea className="h-screen">
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
          <div className="p-4 flex justify-between items-center max-w-5xl mx-auto">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                📚 System Documentation
              </h1>
              <Badge variant="secondary" className="text-xs">
                v1.0.0
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(markdown)}
                className="flex items-center space-x-1"
              >
                <Copy className="h-4 w-4" />
                <span>Copy</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadDocumentation}
                className="flex items-center space-x-1"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleDarkMode}
                className="flex items-center space-x-1"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{isDarkMode ? 'Light' : 'Dark'}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-8 max-w-5xl mx-auto">
          <Card className="shadow-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
            <div className="p-8">
              <div className="prose prose-lg prose-headings:scroll-mt-20 max-w-none dark:prose-invert">
                <article className="markdown-content">
                  <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
                </article>
              </div>
              
              {/* Footer */}
              <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
                  <div>
                    Last updated: {new Date().toLocaleDateString()}
                  </div>
                  <div className="flex items-center space-x-4">
                    <span>Frontend Trading System Documentation</span>
                    <Badge variant="outline" className="text-xs">
                      React + TypeScript
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
