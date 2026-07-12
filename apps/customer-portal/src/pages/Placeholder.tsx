import { Card, Typography } from 'antd';
import { PageContainer } from '@/components/PageContainer';

const { Title, Paragraph } = Typography;

export interface PlaceholderProps {
  pageId: string;
  title: string;
  description: string;
}

export function Placeholder({
  pageId,
  title,
  description,
}: PlaceholderProps): JSX.Element {
  return (
    <PageContainer pageId={pageId} state="READY" title={title}>
      <div style={{ padding: '24px' }}>
        <Card data-testid={`placeholder-${pageId}`}>
          <Title level={4} data-testid={`placeholder-title-${pageId}`}>
            {title}
          </Title>
          <Paragraph type="secondary" data-testid={`placeholder-desc-${pageId}`}>
            {description}
          </Paragraph>
          <Paragraph type="secondary">
            此页面尚未实现，等待后续开发。
          </Paragraph>
        </Card>
      </div>
    </PageContainer>
  );
}
