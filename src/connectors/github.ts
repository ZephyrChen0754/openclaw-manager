import { telegramConnector } from './telegram';

export const githubConnector = {
  ...telegramConnector,
  source_type: 'github',
};

