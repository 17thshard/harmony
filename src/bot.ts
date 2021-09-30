import { Awaited, Client, ClientEvents, Intents, TextChannel } from 'discord.js';
import autoPublish from './auto-publish';
import { Command } from './commands';
import logger from './logging';

const token = process.env.BOT_TOKEN;
if (token === undefined) {
  logger.error('Bot token must be provided via BOT_TOKEN environment variable');
  process.exit(1);
}

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES] });

interface Module {
  command?: Command;
  additionalHandlers?: Partial<{ [K in keyof ClientEvents]: (client: Client, ...args: ClientEvents[K]) => Awaited<void> }>;
}

const modules: Module[] = [autoPublish];
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

client.once('ready', () => {
  logger.info('Ready!');
});

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
  if (module.additionalHandlers !== undefined) {
    Object.keys(module.additionalHandlers).forEach(key => {
      const typedKey = key as keyof ClientEvents;
      const handle = module.additionalHandlers[typedKey];

      client.on(typedKey, async (...args) => {
        try {
          await handle.call(undefined, client, ...args);
        } catch (error) {
          logger.error({
            message: `Failed to run '${key}' handler for module'`,
            error
          });
        }
      });
    });
  }
});

client.login(token);
