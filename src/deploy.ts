import { ApplicationCommandDataResolvable, Client } from 'discord.js';
import logger from './logger';

const token = process.env.BOT_TOKEN;
if (token === undefined) {
  logger.error('Bot token must be provided via BOT_TOKEN environment variable');
  process.exit(1);
}

const cmds: ApplicationCommandDataResolvable[] = [
  {
    type: 'CHAT_INPUT',
    name: 'spoiler-attachments',
    description: 'Send spoilered attachments to this channel from any platform!',
    options: [
      {
        type: 'STRING',
        name: 'caption',
        description: 'A caption to add to your attachments',
        required: false
      }
    ],
    defaultPermission: true
  },
  {
    type: 'CHAT_INPUT',
    name: 'auto-publish',
    description: 'Manage for which channels messages are automatically published',
    options: [
      {
        type: 'SUB_COMMAND',
        name: 'start',
        description: 'Start auto-publishing future messages in a channel',
        options: [
          {
            type: 'CHANNEL',
            name: 'channel',
            description: 'Channel to start watching',
            required: true
          }
        ]
      },
      {
        type: 'SUB_COMMAND',
        name: 'stop',
        description: 'Stop auto-publishing future messages in a channel',
        options: [
          {
            type: 'CHANNEL',
            name: 'channel',
            description: 'Channel to stop watching',
            required: true
          }
        ]
      },
      {
        type: 'SUB_COMMAND',
        name: 'list',
        description: 'List all channels that are currently auto-published'
      }
    ],
    defaultPermission: false
  },
  {
    type: 'CHAT_INPUT',
    name: 'auto-thread-invite',
    description: 'Manage for which channels and roles members are automatically invited to new threads',
    options: [
      {
        type: 'SUB_COMMAND',
        name: 'start',
        description: 'Start auto-inviting role members to new threads in a channel',
        options: [
          {
            type: 'CHANNEL',
            name: 'channel',
            description: 'Channel to start watching',
            required: true
          },
          {
            type: 'ROLE',
            name: 'role',
            description: 'Role whose members to invite to new threads',
            required: true
          }
        ]
      },
      {
        type: 'SUB_COMMAND',
        name: 'stop',
        description: 'Stop auto-inviting role members to new threads in a channel',
        options: [
          {
            type: 'CHANNEL',
            name: 'channel',
            description: 'Channel to stop watching',
            required: true
          },
          {
            type: 'ROLE',
            name: 'role',
            description: 'Role whose members to no longer invite to new threads',
            required: true
          }
        ]
      },
      {
        type: 'SUB_COMMAND',
        name: 'list',
        description: 'List all channels that are currently watched for new threads',
        options: [
          {
            type: 'CHANNEL',
            name: 'channel',
            description: 'Channel to get automatically invited roles for',
            required: false
          }
        ]
      }
    ],
    defaultPermission: false
  },
  {
    type: 'CHAT_INPUT',
    name: 'raw',
    description: 'Get the raw contents of a message',
    options: [
      {
        type: 'STRING',
        name: 'message',
        description: 'Link to a message',
        required: true
      }
    ],
    defaultPermission: true
  }
];

const client = new Client({ intents: [] });
client.once('ready', async () => {
  await client.application.commands.set(cmds);
  console.log('All commands deployed');
  client.destroy();
});

void client.login(token);
