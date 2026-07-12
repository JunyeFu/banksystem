import { useQuery } from '@tanstack/react-query';
import { List, Tag, Empty, Skeleton, Typography } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { MessageListResponse, Message } from '@/types/models';

const { Text } = Typography;

export function Messages(): JSX.Element {
  const { data, isLoading, isError } = useQuery<MessageListResponse>({
    queryKey: ['messages'],
    queryFn: () => apiClient.get<MessageListResponse>('/messages'),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  const messages = data?.items ?? [];

  return (
    <PageContainer
      pageId="customer.messages"
      state={pageState}
      title="消息"
    >
      <div data-testid="message-list" style={{ padding: '24px' }}>
        {isLoading && <Skeleton active />}

        {!isLoading && isError && (
          <Empty description="加载消息列表失败" data-testid="message-list-error" />
        )}

        {!isLoading && !isError && messages.length === 0 && (
          <Empty description="暂无消息" data-testid="message-list-empty" />
        )}

        {!isLoading && !isError && messages.length > 0 && (
          <List
            dataSource={messages}
            renderItem={(msg: Message) => (
              <List.Item
                key={msg.messageId}
                data-testid={`message-item-${msg.messageId}`}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {!msg.read && (
                        <Tag color="blue" data-testid={`message-unread-${msg.messageId}`}>
                          未读
                        </Tag>
                      )}
                      <span data-testid={`message-subject-${msg.messageId}`}>
                        {msg.subject}
                      </span>
                    </span>
                  }
                  description={
                    <Text type="secondary" data-testid={`message-date-${msg.messageId}`}>
                      {msg.createdDate}
                    </Text>
                  }
                />
                <div data-testid={`message-body-${msg.messageId}`}>
                  {msg.body}
                </div>
              </List.Item>
            )}
            pagination={{ pageSize: 10 }}
            data-testid="message-list-items"
          />
        )}
      </div>
    </PageContainer>
  );
}
