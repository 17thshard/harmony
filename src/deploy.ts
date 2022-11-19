import { APIApplicationCommandSubcommandOption, ApplicationCommandDataResolvable, ApplicationCommandOptionChoiceData, ApplicationCommandOptionType, ApplicationCommandType, ChannelType, Client, PermissionFlagsBits } from 'discord.js';
import logger from './utils/logger';

const token = process.env.BOT_TOKEN;
if (token === undefined) {
  logger.error('Bot token must be provided via BOT_TOKEN environment variable');
  process.exit(1);
}

const filterTypes: ApplicationCommandOptionChoiceData<string>[] = [
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
const filterSubCommands: APIApplicationCommandSubcommandOption[] = [
  {
    type: ApplicationCommandOptionType.Subcommand,
    name: 'add',
    description: 'Add a new filter',
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: 'type',
        description: 'The type of filter to apply',
        choices: filterTypes,
        required: true
      },
      {
        type: ApplicationCommandOptionType.String,
        name: 'filter',
        description: 'The content of the filter that gets matched upon based on the filter type',
        required: true
      }
    ]
  },
  {
    type: ApplicationCommandOptionType.Subcommand,
    name: 'delete',
    description: 'Delete an existing filter',
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: 'type',
        description: 'The type of filter to apply',
        choices: filterTypes,
        required: true
      },
      {
        type: ApplicationCommandOptionType.String,
        name: 'filter',
        description: 'The content of the filter that gets matched upon based on the filter type',
        required: true
      }
    ]
  },
  {
    type: ApplicationCommandOptionType.Subcommand,
    name: 'list',
    description: 'List all filters'
  }
];

const cmds: ApplicationCommandDataResolvable[] = [
  {
    type: ApplicationCommandType.ChatInput,
    name: 'spoiler-attachments',
    description: 'Send spoilered attachments to this channel from any platform!',
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: 'caption',
        description: 'A caption to add to your attachments',
        required: false
      }
    ],
    defaultMemberPermissions: PermissionFlagsBits.UseApplicationCommands,
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: 'auto-publish',
    description: 'Manage for which channels messages are automatically published',
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'start',
        description: 'Start auto-publishing future messages in a channel',
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            name: 'channel',
            description: 'Channel to start watching',
            required: true
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'stop',
        description: 'Stop auto-publishing future messages in a channel',
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            name: 'channel',
            description: 'Channel to stop watching',
            required: true
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'list',
        description: 'List all channels that are currently auto-published'
      }
    ],
    // permission required to publish any message in the channel
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: 'auto-thread-invite',
    description: 'Manage for which channels and roles members are automatically invited to new threads',
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'start',
        description: 'Start auto-inviting role members to new threads in a channel',
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            name: 'channel',
            description: 'Channel to start watching',
            required: true
          },
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'Role whose members to invite to new threads',
            required: true
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'stop',
        description: 'Stop auto-inviting role members to new threads in a channel',
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            name: 'channel',
            description: 'Channel to stop watching',
            required: true
          },
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'Role whose members to no longer invite to new threads',
            required: true
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'list',
        description: 'List all channels that are currently watched for new threads',
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            name: 'channel',
            description: 'Channel to get automatically invited roles for',
            required: false
          }
        ]
      }
    ],
    // permission required to see all private threads
    defaultMemberPermissions: PermissionFlagsBits.ManageThreads,
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: 'raw',
    description: 'Get the raw contents of a message',
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: 'message',
        description: 'Link to a message',
        required: true
      }
    ],
    defaultMemberPermissions: PermissionFlagsBits.UseApplicationCommands,
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: 'message-filter',
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
    description: 'Manage message filters for this server',
    options: [
      {
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: 'forbidden',
        description: 'Manage forbidden words and phrases',
        options: filterSubCommands
      },
      {
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: 'allowed',
        description: 'Manage words and phrases that are explicitly allowed (and take priority over forbbiden words)',
        options: filterSubCommands
      },
      {
        type: ApplicationCommandOptionType.SubcommandGroup,
        name: 'exemptions',
        description: 'Manage exemptions to the message filter',
        options: [
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: 'add',
            description: 'Add an exemption. Must provide exactly one of the available options',
            options: [
              {
                type: ApplicationCommandOptionType.User,
                name: 'user',
                description: 'The user to exempt'
              },
              {
                type: ApplicationCommandOptionType.Role,
                name: 'role',
                description: 'The role to exempt'
              },
              {
                type: ApplicationCommandOptionType.Channel,
                name: 'channel',
                description: 'The channel to exempt'
              }
            ]
          },
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: 'delete',
            description: 'Delete an exemption. Must provide exactly one of the available options',
            options: [
              {
                type: ApplicationCommandOptionType.User,
                name: 'user',
                description: 'The user to exempt'
              },
              {
                type: ApplicationCommandOptionType.Role,
                name: 'role',
                description: 'The role to exempt'
              },
              {
                type: ApplicationCommandOptionType.Channel,
                name: 'channel',
                description: 'The channel to exempt'
              }
            ]
          },
          {
            type: ApplicationCommandOptionType.Subcommand,
            name: 'list',
            description: 'List all exemptions'
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'test',
        description: 'Test the filters against an example message',
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: 'text',
            description: 'The text to filter',
            required: true
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'set-logging-channel',
        description: 'Specify the channel where deletions should be logged',
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            name: 'channel',
            description: 'The log channel to use',
            required: true
          }
        ]
      }
    ]
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: 'manage-channel-starboard',
    defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    description: 'Manage the starboard thread for a channel',
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'set',
        description: 'Set the starboard thread for a channel',
        options: [
          {
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread, ChannelType.GuildNewsThread],
            name: 'thread',
            description: 'Starboard thread for the channel',
            required: true,
          },
          {
            name: 'channel',
            description: 'Channel to manage',
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildText, ChannelType.GuildNews],
            required: false,
          },
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'remove',
        description: 'Remove the starboard thread for the channel',
        options: [
          {
            name: 'channel',
            description: 'Channel to manage',
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildText, ChannelType.GuildNews],
            required: false,
          },
        ]
      },
    ]
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
