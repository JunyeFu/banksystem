import { PageContainer } from '@/components/PageContainer';

export interface PlaceholderProps {
  pageId: string;
  title: string;
  description: string;
}

export function Placeholder({ pageId, title, description }: PlaceholderProps): JSX.Element {
  return (
    <PageContainer pageId={pageId} state="READY" title={title}>
      <p data-testid={`${pageId}-description`} style={{ color: '#888' }}>
        {description}
      </p>
    </PageContainer>
  );
}
