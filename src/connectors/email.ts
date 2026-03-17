import { telegramConnector } from './telegram';

export const emailConnector = {
  ...telegramConnector,
  source_type: 'email',
};

