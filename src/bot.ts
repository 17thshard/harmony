import { ActivityType, Awaitable, Client, ClientEvents, FetchedThreads, Guild, Partials, TextChannel, ThreadChannel } from 'discord.js';
import autoPublish from './cmds/auto-publish';
import spoilerAttachments from './cmds/spoiler-attachments';
import autoThreadInvite from './cmds/auto-thread-invite';
import rawMessage from './cmds/raw-message';
import messageFilter from './cmds/message-filter';
import channelStarboard from './cmds/channel-starboard';
import { Command } from './commands';
import logger from './utils/logger';

const token = process.env.BOT_TOKEN;
if (token === undefined) {
  logger.error('Bot token must be provided via BOT_TOKEN environment variable');
  process.exit(1);
}

const client = new Client({
  intents: [
    'Guilds',
    'GuildMembers',
    'GuildMessages',
    'DirectMessages',
    'MessageContent',
    'GuildMessageReactions',
  ],
  
  partials: [
    Partials.Reaction,
    Partials.User,
    Partials.Message,
  ],
});

export interface Module {
  command?: Command;
  additionalHandlers?: Partial<{ [K in keyof ClientEvents]: (client: Client, ...args: ClientEvents[K]) => Awaitable<void> }>;
}

const modules: Module[] = [
  autoPublish,
  spoilerAttachments,
  autoThreadInvite,
  rawMessage,
  messageFilter,
  channelStarboard,
];
const commands = modules.reduce<{ [name: string]: Command }>(
  (acc, module) => {
    if (module.command === undefined) {
      return acc;
    }

    acc[module.command.name] = module.command;

    return acc;
  },
  {}
);

client.once('ready', async () => {
  logger.info('Ready!');
  client.user?.setActivity({
    type: ActivityType.Watching,
    name: 'YOU 👁👁'
  });
  await Promise.all(client.guilds.valueOf().map(joinActiveThreads));
});

async function tryJoinThread (thread: ThreadChannel) {
  if (thread.joinable && !thread.joined) {
    await thread.join();
  }
}

async function joinActiveThreads (guild: Guild) {
  let activeThreads: FetchedThreads;
  do {
    activeThreads = await guild.channels.fetchActiveThreads();
    await Promise.all(activeThreads.threads.map(tryJoinThread));
  } while (activeThreads.hasMore);
}

client.on('threadCreate', tryJoinThread);
client.on('threadUpdate', (_, newThread: ThreadChannel) => tryJoinThread(newThread));
client.on('threadListSync', async threads => {
  await Promise.all(threads.map(tryJoinThread));
});
client.on('guildCreate', joinActiveThreads);

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) {
    return;
  }

  const command = commands[interaction.commandName];
  if (command === undefined) {
    const channel = await client.channels.fetch(interaction.channelId) as TextChannel;
    logger.error({
      message: `Could not find handler for command '${interaction.commandName}'`,
      context: {
        user: interaction.user.tag,
        channel: `#${channel.name}`,
        guild: interaction.guildId
      }
    });
    console.log(interaction);

    await interaction.reply({ content: 'Sorry, I cannot handle this command!', ephemeral: true });
    return;
  }

  try {
    await command.handle(client, interaction);
  } catch (error) {
    const channel = await client.channels.fetch(interaction.channelId) as TextChannel;
    logger.error({
      message: `Failed to handle command '${interaction.commandName}'`,
      error,
      context: {
        user: interaction.user.tag,
        channel: `#${channel.name}`,
        guild: interaction.guildId
      }
    });

    await interaction.followUp({ content: 'An error ocurred while handling this command!', ephemeral: true });
  }
});

modules.forEach((module) => {
  const additionalHandlers = module.additionalHandlers;
  if (additionalHandlers !== undefined) {
    Object.entries(additionalHandlers).forEach(([key, handle]) => {
      const typedKey = key as keyof ClientEvents;

      client.on(typedKey, async (...args) => {
        try {
          await handle.call(undefined, client, ...args);
        } catch (error) {
          logger.error({
            message: `Failed to run '${key}' handler for module`,
            error
          });
        }
      });
    });
  }
});

client.login(token);
