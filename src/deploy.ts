import { ApplicationCommandDataResolvable, ApplicationCommandOptionChoice, ApplicationCommandSubCommandData, Client } from 'discord.js';
import logger from './logger';

const token = process.env.BOT_TOKEN;
if (token === undefined) {
  logger.error('Bot token must be provided via BOT_TOKEN environment variable');
  process.exit(1);
}

const guildTextChannelTypes = [
  'GUILD_TEXT' as const,
  'GUILD_NEWS' as const,
  'GUILD_NEWS_THREAD' as const,
  'GUILD_PRIVATE_THREAD' as const,
  'GUILD_PUBLIC_THREAD' as const,
];

const filterTypes: ApplicationCommandOptionChoice[] = [
  {
    name: 'Matches any message that contains the filter content verbatim',
    value: 'contains'
  },
  {
    name: 'Matches any message that contains the filter content as word (separated by spaces)',
    value: 'word'
  },
  {
    name: 'Matches any message that the filter content matches when interpreted as regular expression',
    value: 'regex'
  }
];
const filterSubCommands: ApplicationCommandSubCommandData[] = [
  {
    type: 'SUB_COMMAND',
    name: 'add',
    description: 'Add a new filter',
    options: [
      {
        type: 'STRING',
        name: 'type',
        description: 'The type of filter to apply',
        choices: filterTypes,
        required: true
      },
      {
        type: 'STRING',
        name: 'filter',
        description: 'The content of the filter that gets matched upon based on the filter type',
        required: true
      }
    ]
  },
  {
    type: 'SUB_COMMAND',
    name: 'delete',
    description: 'Delete an existing filter',
    options: [
      {
        type: 'STRING',
        name: 'type',
        description: 'The type of filter to apply',
        choices: filterTypes,
        required: true
      },
      {
        type: 'STRING',
        name: 'filter',
        description: 'The content of the filter that gets matched upon based on the filter type',
        required: true
      }
    ]
  },
  {
    type: 'SUB_COMMAND',
    name: 'list',
    description: 'List all filters'
  }
];

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
  },
  {
    type: 'CHAT_INPUT',
    name: 'message-filter',
    defaultPermission: false,
    description: 'Manage message filters for this server',
    options: [
      {
        type: 'SUB_COMMAND_GROUP',
        name: 'forbidden',
        description: 'Manage forbidden words and phrases',
        options: filterSubCommands
      },
      {
        type: 'SUB_COMMAND_GROUP',
        name: 'allowed',
        description: 'Manage words and phrases that are explicitly allowed (and take priority over forbbiden words)',
        options: filterSubCommands
      },
      {
        type: 'SUB_COMMAND_GROUP',
        name: 'exemptions',
        description: 'Manage exemptions to the message filter',
        options: [
          {
            type: 'SUB_COMMAND',
            name: 'add',
            description: 'Add an exemption. Must provide exactly one of the available options',
            options: [
              {
                type: 'USER',
                name: 'user',
                description: 'The user to exempt'
              },
              {
                type: 'ROLE',
                name: 'role',
                description: 'The role to exempt'
              },
              {
                type: 'CHANNEL',
                name: 'channel',
                description: 'The channel to exempt'
              }
            ]
          },
          {
            type: 'SUB_COMMAND',
            name: 'delete',
            description: 'Delete an exemption. Must provide exactly one of the available options',
            options: [
              {
                type: 'USER',
                name: 'user',
                description: 'The user to exempt'
              },
              {
                type: 'ROLE',
                name: 'role',
                description: 'The role to exempt'
              },
              {
                type: 'CHANNEL',
                name: 'channel',
                description: 'The channel to exempt'
              }
            ]
          },
          {
            type: 'SUB_COMMAND',
            name: 'list',
            description: 'List all exemptions'
          }
        ]
      },
      {
        type: 'SUB_COMMAND',
        name: 'set-logging-channel',
        description: 'Specify the channel where deletions should be logged',
        options: [
          {
            type: 'CHANNEL',
            name: 'channel',
            description: 'The log channel to use',
            required: true
          }
        ]
      }
    ]
  },
  {
    type: 'CHAT_INPUT',
    name: 'mod',
    description: 'Send a message in a more official-looking way',
    options: [
      {
        type: 'STRING',
        name: 'content',
        description: 'Content of the message to send',
        required: true
      },
      {
        type: 'STRING',
        name: 'edit-link',
        description: 'If provided, will edit the message at the given link rather than sending a new one',
        required: false
      },
      {
        type: 'CHANNEL',
        name: 'channel',
        description: 'If provided, will send in the specified channel instead of this one',
        required: false,
        channelTypes: guildTextChannelTypes
      },
      //{
      //  type: 'ATTACHMENT',
      //  name: 'attachment',
      //  description: 'Optional attachment to include',
      //  required: false
      //},
    ],
    defaultPermission: false
  },
  {
    type: 'CHAT_INPUT',
    name: 'webhook',
    description: 'Send and edit webhook messages',
    options: [
      {
        type: 'STRING',
        name: 'content',
        description: 'Content of the message to send. Prefix with `RAW:` to interpret the rest of the string as raw JSON.',
        required: true
      },
      {
        type: 'STRING',
        name: 'edit-link',
        description: '(Incompat. with appearance + destination opts) Link to message to edit rather than sending a new one',
        required: false
      },
      {
        type: 'CHANNEL',
        name: 'channel',
        description: 'If provided, will send in the specified channel instead of this one',
        required: false,
        channelTypes: guildTextChannelTypes
      },
      //{
      //  type: 'ATTACHMENT',
      //  name: 'attachment',
      //  description: 'Optional attachment to include',
      //  required: false
      //},
      {
        type: 'STRING',
        name: 'webhook-id',
        description: 'Alternate webhook to use instead of the default one.',
        required: false
      },
      {
        type: 'STRING',
        name: 'username',
        description: 'Alternate username to post with instead of the webhook\'s default',
        required: false
      },
      {
        type: 'STRING',
        name: 'avatar-link',
        description: 'Alternate avatar to post with instead of the webhook\'s default. Lower priority than `avatar`.',
        required: false
      },
      //{
      //  type: 'ATTACHMENT',
      //  name: 'avatar',
      //  description: 'Alternate avatar to post with instead of the webhook\'s default. Higher priority than `avatar-link`.',
      //  required: false
      //},
    ],
    defaultPermission: false
  },
];

const client = new Client({ intents: [] });
client.once('ready', async () => {
  const guildId = process.env.HARMONY_DEPLOY_GUILD;
  if (guildId) await (await client.guilds.fetch(guildId)).commands.set(cmds);
  else await client.application.commands.set(cmds);
  console.log('All commands deployed');
  client.destroy();
});

void client.login(token);
