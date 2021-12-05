import { ComplexCommand } from './commands';
import { Client, ColorResolvable, CommandInteraction, Message, MessageEmbed, Permissions, TextChannel } from 'discord.js';
import storage from './storage';
import logger from './logger';

function buildStorageKey (guild: string, channel: string) {
  return `autoPublish.${guild}.${channel}`;
}

function buildEmbed (message: string, color?: ColorResolvable): MessageEmbed {
  const embed = new MessageEmbed()
    .setTitle('Auto Publish')
    .setDescription(message);

  if (color !== undefined) {
    embed.setColor(color);
  }

  return embed;
}

export default {
  command: new ComplexCommand(
    'auto-publish',
    {
      async start (client: Client, interaction: CommandInteraction) {
        const channel = interaction.options.getChannel('channel', true);

        if (channel.type !== 'GUILD_NEWS') {
          await interaction.reply({
            embeds: [
              buildEmbed(
                `Cannot watch ${channel} for auto-publishing, as it is not an announcement channel!`,
                'RED'
              )
            ]
          });
          return;
        }

        if (!channel.permissionsFor(interaction.user).has(Permissions.FLAGS.MANAGE_MESSAGES)) {
          await interaction.reply({
            embeds: [
              buildEmbed(
                `Cannot watch ${channel} for auto-publishing, you do not have permissions to manage messages there!`,
                'RED'
              )
            ]
          });
          return;
        }

        const storageKey = buildStorageKey(interaction.guildId, channel.id);
        if (storage.get(storageKey) === true) {
          await interaction.reply({ embeds: [buildEmbed(`${channel} is already being watched for new messages!`)] });
          return;
        }

        try {
          storage.set(storageKey, true);
        } catch (error) {
          const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
          logger.error({
            message: 'Could not add channel to auto-publish list',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${sourceChannel.name}`,
              targetchannel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });

          await interaction.reply({ embeds: [buildEmbed(`An error occurred while trying to start watching ${channel}`, 'RED')] });

          return;
        }

        logger.info(`Started watching channel #${channel.name} on guild ${interaction.guildId} for auto-publishing`);

        await interaction.reply({ embeds: [buildEmbed(`Started watching ${channel}! New messages will be automatically published.`)] });
      },
      async stop (client: Client, interaction: CommandInteraction) {
        const channel = interaction.options.getChannel('channel', true);

        if (channel.type === 'GUILD_NEWS' && !channel.permissionsFor(interaction.user).has(Permissions.FLAGS.MANAGE_MESSAGES)) {
          await interaction.reply({
            embeds: [
              buildEmbed(
                `You must be able to manage messages in ${channel} to manage its auto-publishing status!`,
                'RED'
              )
            ]
          });
          return;
        }

        const storageKey = buildStorageKey(interaction.guildId, channel.id);
        if (storage.get(storageKey) !== true) {
          await interaction.reply({ embeds: [buildEmbed(`${channel} is not being watched for new messages!`, 'RED')] });
          return;
        }

        try {
          storage.delete(buildStorageKey(interaction.guildId, channel.id));
        } catch (error) {
          const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
          logger.error({
            message: 'Could not remove channel from auto-publish list',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${sourceChannel.name}`,
              targetchannel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });

          await interaction.reply({ embeds: [buildEmbed(`An error occurred while trying to stop watching ${channel}`, 'RED')] });

          return;
        }

        logger.info(`Stopped watching channel #${channel.name} on guild ${interaction.guildId} for auto-publishing`);

        await interaction.reply({ embeds: [buildEmbed(`Stopped watching ${channel}! New messages will no longer be automatically published.`)] });
      },
      async list (client: Client, interaction: CommandInteraction) {
        try {
          const prefix = `autoPublish.${interaction.guildId}.`;
          const keys = storage.keys().filter(key => key.startsWith(prefix) && storage.get(key) === true);
          const list = await Promise.all(keys.map(async key => {
            const channel = await client.channels.fetch(key.substring(prefix.length));
            const stats = storage.get(`${key}.stats`);
            const pluralS = stats !== 1 ? 's' : '';

            return ` • ${channel}: ${stats === undefined || stats === 0 ? 'No' : stats} message${pluralS} auto-published so far`;
          }));

          const baseMessage = list.length > 0
            ? `Currently, the following channels are being watched for new messages to auto-publish:\n${list.join('\n')}`
            : 'Currently, no channels are being watched for new messages to auto-publish.';

          await interaction.reply({
            embeds: [
              buildEmbed(
                `${baseMessage}\n\nTo start watching a channel, use the \`/auto-publish start #channel\` command.\nTo stop watching a channel, use the \`/auto-publish stop #channel\` command`
              )
            ]
          });
        } catch (error) {
          logger.error({
            message: 'Could not retrieve channels from storage',
            error,
            context: {
              user: interaction.user.tag,
              guild: interaction.guildId
            }
          });

          await interaction.reply({ embeds: [buildEmbed('An error occurred while trying to list all watched channels', 'RED')] });
        }
      }
    }
  ),
  additionalHandlers: {
    async messageCreate (client: Client, message: Message): Promise<void> {
      if (!message.channel.isText()) {
        return;
      }

      if (message.channel.type !== 'GUILD_NEWS') {
        return;
      }

      const storageKey = buildStorageKey(message.guildId, message.channelId);
      if (storage.get(storageKey) !== true) {
        return;
      }

      try {
        logger.info({
          message: `Auto-publishing a message from ${message.author.tag}...`,
          context: {
            channel: `#${message.channel.name}`,
            guild: message.guildId
          }
        });

        await message.crosspost();
        logger.info({
          message: `Auto-published message from ${message.author.tag}`,
          context: {
            channel: `#${message.channel.name}`,
            guild: message.guildId
          }
        });
      } catch (error) {
        logger.error({
          message: `Failed to auto-publish message from ${message.author.tag}`,
          error,
          context: {
            channel: `#${message.channel.name}`,
            guild: message.guildId
          }
        });

        return;
      }

      const statsKey = `${storageKey}.stats`;
      const currentStats = storage.get(statsKey, 0);
      storage.set(statsKey, currentStats + 1);
    }
  }
};
