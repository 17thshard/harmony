import { ComplexCommand } from './commands';
import {
  Client,
  ColorResolvable,
  CommandInteraction,
  GuildTextBasedChannel,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  Permissions,
  TextChannel
} from 'discord.js';
import { guilds as storage } from './storage';
import logger from './logger';

function buildEmbed (message: string, color?: ColorResolvable): MessageEmbed {
  const embed = new MessageEmbed()
    .setTitle('Auto Publish')
    .setDescription(message);

  if (color !== undefined) {
    embed.setColor(color);
  }

  return embed;
}

async function publishMessage (message: Message): Promise<boolean> {
  const channelStorage = storage.channels(message.guildId);
  if (channelStorage.get(message.channelId, 'autoPublish') !== true) {
    return true;
  }

  const channelName = `#${(message.channel as GuildTextBasedChannel).name}`;

  try {
    logger.info({
      message: `Auto-publishing a message from ${message.author.tag}...`,
      context: {
        channel: channelName,
        guild: message.guildId
      }
    });

    await message.crosspost();
    logger.info({
      message: `Auto-published message from ${message.author.tag}`,
      context: {
        channel: channelName,
        guild: message.guildId
      }
    });
  } catch (error) {
    logger.error({
      message: `Failed to auto-publish message from ${message.author.tag}`,
      error,
      context: {
        channel: channelName,
        guild: message.guildId
      }
    });

    return false;
  }

  const currentStats = channelStorage.get(message.channelId, 'autoPublish.stats', v => v, 0);
  channelStorage.set(message.channelId, 'autoPublish.stats', currentStats + 1);

  return true;
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

        if (storage.channels(interaction.guildId).get(channel.id, 'autoPublish') === true) {
          await interaction.reply({ embeds: [buildEmbed(`${channel} is already being watched for new messages!`)] });
          return;
        }

        try {
          storage.channels(interaction.guildId).set(channel.id, 'autoPublish', true);
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

        if (storage.channels(interaction.guildId).get(channel.id, 'autoPublish') !== true) {
          await interaction.reply({ embeds: [buildEmbed(`${channel} is not being watched for new messages!`, 'RED')] });
          return;
        }

        try {
          storage.channels(interaction.guildId).delete(channel.id, 'autoPublish');
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
          const channelStorage = storage.channels(interaction.guildId);
          const values = channelStorage.list('autoPublish');
          const list = await Promise.all(Object.keys(values).filter(key => values[key]).map(async key => {
            const channel = await client.channels.fetch(key);
            const stats = channelStorage.get(key, 'autoPublish.stats', v => v, 0);
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

      for (let trial = 1; trial <= 3; trial++) {
        try {
          if (await publishMessage(message)) {
            return;
          }
        } catch (error) {
          logger.error({
            message: `Failed to auto-publish message from ${message.author.tag}`,
            error,
            context: {
              channel: `#${(message.channel as GuildTextBasedChannel).name}`,
              guild: message.guildId
            }
          });
        }

        if (trial < 3) {
          logger.warn(`Failed to auto-publish message in try #${trial}. Trying again...`);
        }
      }

      logger.error('Failed to auto-publish message after multiple retries');

      const adminId = process.env.HARMONY_ADMIN_USER;
      if (adminId === undefined || adminId === '') {
        return;
      }

      logger.info('Notifying admin about failed retries...');
      const adminUser = await client.users.fetch(adminId);
      await adminUser.send({
        embeds: [
          buildEmbed(
            `Failed to auto-publish message from ${message.author} in ${message.channel}!`,
            'RED'
          )
        ],
        components: [
          new MessageActionRow().addComponents([
            new MessageButton()
              .setStyle('LINK')
              .setLabel('Go to message')
              .setURL(`https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`)
          ])
        ]
      });
    }
  }
};
