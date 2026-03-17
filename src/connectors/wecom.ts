import { telegramConnector } from './telegram';

export const wecomConnector = {
  ...telegramConnector,
  source_type: 'wecom',
};

