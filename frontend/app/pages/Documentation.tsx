import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from '@/lib/i18n';
import { Card } from '@/components/ui/card';

export default function Documentation() {
  const { t } = useTranslation();
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Card className="p-8">
        <article className="prose max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-blue-600 hover:prose-a:text-blue-800 prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </article>
      </Card>
    </div>
  );
}
